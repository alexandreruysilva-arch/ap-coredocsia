/**
 * Construtor de CMS/SignedData (CAdES-BES) compatível com o validador do ITI
 * (https://validar.iti.gov.br) e com o Adobe Reader.
 *
 * Motivação: o `forge.pkcs7.createSignedData()` do node-forge produz um
 * SignerInfo com `digestEncryptionAlgorithm = rsaEncryption` (1.2.840.113549.1.1.1)
 * e não suporta atributos assinados fora de contentType/messageDigest/signingTime.
 * Isso faz o ITI reportar duas falhas:
 *
 *  - "Cifra assimétrica": o OID do algoritmo de assinatura precisa ser
 *    `sha256WithRSAEncryption` (1.2.840.113549.1.1.11), e não `rsaEncryption`.
 *  - "Status da assinatura": o DOC-ICP-15 exige o atributo assinado ESS
 *    `signingCertificateV2` (1.2.840.113549.1.9.16.2.47) amarrando a assinatura
 *    ao certificado do signatário.
 *
 * Este módulo monta o ASN.1 manualmente para atender aos dois requisitos.
 * Toda a operação continua acontecendo no navegador: a chave privada nunca é
 * serializada nem enviada pela rede.
 */
import forge from "node-forge";

const asn1 = forge.asn1;

/** OIDs utilizados na estrutura CMS. */
const OID = {
  data: "1.2.840.113549.1.7.1",
  signedData: "1.2.840.113549.1.7.2",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingTime: "1.2.840.113549.1.9.5",
  signingCertificateV2: "1.2.840.113549.1.9.16.2.47",
  sha256: "2.16.840.1.101.3.4.2.1",
  sha256WithRSA: "1.2.840.113549.1.1.11",
} as const;

type Asn1 = forge.asn1.Asn1;

function oid(value: string): Asn1 {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(value).getBytes());
}

function seq(values: Asn1[]): Asn1 {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, values);
}

function set(values: Asn1[]): Asn1 {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, values);
}

function octetString(bytes: string): Asn1 {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, bytes);
}

/** AlgorithmIdentifier com parâmetros NULL (exigido pelo perfil ICP-Brasil). */
function algId(algorithmOid: string): Asn1 {
  return seq([oid(algorithmOid), asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, "")]);
}

function attribute(type: string, value: Asn1): Asn1 {
  return seq([oid(type), set([value])]);
}

function derBytes(node: Asn1): string {
  return asn1.toDer(node).getBytes();
}

function sha256Of(binary: string): forge.md.MessageDigest {
  const md = forge.md.sha256.create();
  md.update(binary);
  return md;
}

/** Name (RDNSequence) do emissor do certificado. */
function issuerToAsn1(certificate: forge.pki.Certificate): Asn1 {
  return forge.pki.distinguishedNameToAsn1(
    certificate.issuer as unknown as Parameters<typeof forge.pki.distinguishedNameToAsn1>[0],
  );
}

/**
 * ESS SigningCertificateV2 (RFC 5035):
 *   SigningCertificateV2 ::= SEQUENCE { certs SEQUENCE OF ESSCertIDv2 }
 *   ESSCertIDv2 ::= SEQUENCE { hashAlgorithm DEFAULT sha256, certHash OCTET STRING, issuerSerial }
 *   IssuerSerial ::= SEQUENCE { issuer GeneralNames, serialNumber INTEGER }
 */
function signingCertificateV2(certificate: forge.pki.Certificate): Asn1 {
  const certDer = derBytes(forge.pki.certificateToAsn1(certificate));
  const certHash = sha256Of(certDer).digest().getBytes();

  const issuerName = issuerToAsn1(certificate);

  // GeneralName ::= [4] EXPLICIT Name (directoryName)
  const directoryName = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 4, true, [issuerName]);
  const generalNames = seq([directoryName]);

  const serialHex =
    certificate.serialNumber.length % 2 === 1
      ? `0${certificate.serialNumber}`
      : certificate.serialNumber;
  const serial = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.INTEGER,
    false,
    forge.util.hexToBytes(serialHex),
  );

  const issuerSerial = seq([generalNames, serial]);
  // hashAlgorithm sha256 é o DEFAULT e por isso é omitido (regra DER).
  const essCertIdV2 = seq([octetString(certHash), issuerSerial]);

  return seq([seq([essCertIdV2])]);
}

export interface CmsOptions {
  /** Conteúdo assinado, como binary string (latin1). */
  content: string;
  certificate: forge.pki.Certificate;
  privateKey: forge.pki.rsa.PrivateKey;
  /** Certificados intermediários/raiz para montar o caminho de confiança. */
  chain?: forge.pki.Certificate[];
  /** Momento da assinatura (default: agora). */
  signingTime?: Date;
}

/**
 * Gera o CMS SignedData destacado (detached) em DER, como binary string.
 * O conteúdo não é embutido — apenas seu digest, dentro dos atributos assinados.
 */
export function buildDetachedCms(options: CmsOptions): string {
  const { content, certificate, privateKey, chain = [], signingTime = new Date() } = options;

  const contentDigest = sha256Of(content).digest().getBytes();

  // --- Atributos assinados (SignedAttributes) -----------------------------
  const signedAttrs = [
    attribute(OID.contentType, oid(OID.data)),
    attribute(
      OID.signingTime,
      asn1.create(
        asn1.Class.UNIVERSAL,
        asn1.Type.UTCTIME,
        false,
        asn1.dateToUtcTime(signingTime),
      ),
    ),
    attribute(OID.messageDigest, octetString(contentDigest)),
    attribute(OID.signingCertificateV2, signingCertificateV2(certificate)),
  ];

  // Assinado como SET OF (tag 0x31), conforme RFC 5652 §5.4.
  const attrsForSigning = set(signedAttrs);
  const attrsDer = derBytes(attrsForSigning);

  const signatureDigest = sha256Of(attrsDer);
  // RSASSA-PKCS1-v1_5 com DigestInfo SHA-256 (padrão do node-forge).
  const signature = privateKey.sign(signatureDigest);

  // No SignerInfo os atributos vão em [0] IMPLICIT.
  const signedAttrsImplicit = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, signedAttrs);

  const issuerAndSerial = seq([
    issuerToAsn1(certificate),
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.INTEGER,
      false,
      forge.util.hexToBytes(
        certificate.serialNumber.length % 2 === 1
          ? `0${certificate.serialNumber}`
          : certificate.serialNumber,
      ),
    ),
  ]);

  const signerInfo = seq([
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, String.fromCharCode(1)), // version 1
    issuerAndSerial,
    algId(OID.sha256),
    signedAttrsImplicit,
    algId(OID.sha256WithRSA), // corrige a falha de "cifra assimétrica"
    octetString(signature),
  ]);

  const allCerts = [certificate, ...chain.filter((c) => c !== certificate)];
  const certificatesImplicit = asn1.create(
    asn1.Class.CONTEXT_SPECIFIC,
    0,
    true,
    allCerts.map((cert) => forge.pki.certificateToAsn1(cert)),
  );

  const signedData = seq([
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, String.fromCharCode(1)), // version
    set([algId(OID.sha256)]),
    seq([oid(OID.data)]), // encapContentInfo sem conteúdo (detached)
    certificatesImplicit,
    set([signerInfo]),
  ]);

  const contentInfo = seq([
    oid(OID.signedData),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData]),
  ]);

  return derBytes(contentInfo);
}

/** Converte a binary string DER em bytes. */
export function derToBytes(der: string): Uint8Array {
  const bytes = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i += 1) bytes[i] = der.charCodeAt(i) & 0xff;
  return bytes;
}
