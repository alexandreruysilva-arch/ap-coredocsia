/**
 * Assinatura digital PKCS#7 / CAdES-BES (detached) 100% no navegador.
 *
 * Motivação de segurança: navegadores não têm acesso ao repositório de
 * certificados do sistema operacional. Por isso o usuário fornece o arquivo
 * PFX/P12 e a senha, e TODO o processamento (parse do PKCS#12, extração da
 * chave privada e geração da assinatura) acontece na memória da aba, sem
 * nenhuma requisição de rede. A chave privada nunca é serializada, persistida
 * em storage nem enviada ao servidor.
 */
import forge from "node-forge";
import { buildDetachedCms, derToBytes } from "@/lib/cades";

export interface CertificateInfo {
  /** Índice do "safe bag" dentro do PKCS#12 — usado para escolher o certificado. */
  index: number;
  subjectCN: string;
  issuerCN: string;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  /** true quando a data atual está fora da janela de validade. */
  expired: boolean;
  /** true quando o bag possui chave privada associada (obrigatório para assinar). */
  hasPrivateKey: boolean;
}

export interface LoadedCertificate extends CertificateInfo {
  certificate: forge.pki.Certificate;
  privateKey: forge.pki.PrivateKey;
  /** Cadeia adicional (intermediárias/raiz) encontrada no PFX. */
  chain: forge.pki.Certificate[];
}

export class SignatureError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_PASSWORD"
      | "INVALID_FILE"
      | "NO_PRIVATE_KEY"
      | "EXPIRED"
      | "SIGN_FAILED"
      | "VERIFY_FAILED",
  ) {
    super(message);
    this.name = "SignatureError";
  }
}

function commonName(attrs: forge.pki.CertificateField[] | undefined): string {
  if (!attrs) return "—";
  const cn = attrs.find((a) => a.shortName === "CN" || a.name === "commonName");
  const value = cn?.value;
  return typeof value === "string" && value.length > 0 ? value : "—";
}

function arrayBufferToBinaryString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000; // evita "Maximum call stack size exceeded" em arquivos grandes
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return binary;
}

/**
 * Abre um PFX/P12 e devolve todos os pares certificado + chave privada.
 * Lança SignatureError com códigos tratáveis pela UI.
 */
export async function loadPkcs12(file: File, password: string): Promise<LoadedCertificate[]> {
  let p12: forge.pkcs12.Pkcs12Pfx;
  let asn1: forge.asn1.Asn1;

  const binary = arrayBufferToBinaryString(await file.arrayBuffer());

  try {
    asn1 = forge.asn1.fromDer(binary);
  } catch {
    throw new SignatureError(
      "Arquivo inválido. Selecione um certificado no formato .pfx ou .p12.",
      "INVALID_FILE",
    );
  }

  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/mac|password|invalid/i.test(message)) {
      throw new SignatureError("Senha do certificado incorreta.", "INVALID_PASSWORD");
    }
    throw new SignatureError(`Não foi possível abrir o certificado: ${message}`, "INVALID_FILE");
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];

  if (certBags.length === 0) {
    throw new SignatureError("Nenhum certificado encontrado no arquivo.", "INVALID_FILE");
  }

  const allCerts = certBags
    .map((bag) => bag.cert)
    .filter((cert): cert is forge.pki.Certificate => Boolean(cert));

  const results: LoadedCertificate[] = [];
  const now = new Date();

  allCerts.forEach((certificate, index) => {
    // Casa a chave pela localKeyId quando disponível; senão usa a única chave do arquivo.
    const certKeyId = certBags[index]?.attributes?.localKeyId?.[0];
    const matched =
      keyBags.find((kb) => {
        const keyId = kb.attributes?.localKeyId?.[0];
        return certKeyId != null && keyId != null && keyId === certKeyId;
      }) ?? (keyBags.length === 1 ? keyBags[0] : undefined);

    const privateKey = matched?.key;
    if (!privateKey) return; // certificado de cadeia (intermediária/raiz), não assina

    const validTo = certificate.validity.notAfter;
    const validFrom = certificate.validity.notBefore;

    results.push({
      index,
      certificate,
      privateKey,
      chain: allCerts.filter((c) => c !== certificate),
      subjectCN: commonName(certificate.subject.attributes),
      issuerCN: commonName(certificate.issuer.attributes),
      serialNumber: certificate.serialNumber,
      validFrom,
      validTo,
      expired: now < validFrom || now > validTo,
      hasPrivateKey: true,
    });
  });

  if (results.length === 0) {
    throw new SignatureError(
      "O arquivo não contém chave privada. Exporte o certificado incluindo a chave privada.",
      "NO_PRIVATE_KEY",
    );
  }

  return results;
}

export interface SignedResult {
  /** Nome sugerido: <arquivo original>.p7s */
  fileName: string;
  /** Assinatura destacada em DER. */
  blob: Blob;
  /** Hash SHA-256 do conteúdo assinado (hex), útil para auditoria. */
  sha256: string;
}

/**
 * Gera uma assinatura PKCS#7 destacada (detached / CAdES-BES) para um arquivo.
 * O conteúdo original permanece intacto; a assinatura é um arquivo .p7s separado.
 */
export async function signFileDetached(
  file: File,
  signer: LoadedCertificate,
): Promise<SignedResult> {
  if (signer.expired) {
    throw new SignatureError(
      `Certificado fora da validade (expirou em ${signer.validTo.toLocaleDateString("pt-BR")}).`,
      "EXPIRED",
    );
  }

  try {
    const binary = arrayBufferToBinaryString(await file.arrayBuffer());

    const md = forge.md.sha256.create();
    md.update(binary);
    const sha256 = md.digest().toHex();

    // CMS CAdES-BES com sha256WithRSAEncryption + signingCertificateV2 (ICP-Brasil).
    const der = buildDetachedCms({
      content: binary,
      certificate: signer.certificate,
      privateKey: signer.privateKey as forge.pki.rsa.PrivateKey,
      chain: signer.chain,
    });
    const bytes = derToBytes(der);

    return {
      fileName: `${file.name}.p7s`,
      blob: new Blob([bytes], { type: "application/pkcs7-signature" }),
      sha256,
    };
  } catch (error) {
    if (error instanceof SignatureError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new SignatureError(`Falha ao assinar: ${message}`, "SIGN_FAILED");
  }
}

export interface VerificationResult {
  valid: boolean;
  signerCN: string;
  issuerCN: string;
  signedAt: Date | null;
  reason?: string;
}

/**
 * Verifica se um .p7s destacado corresponde ao arquivo original comparando o
 * atributo autenticado messageDigest com o SHA-256 recalculado do conteúdo.
 */
export async function verifyDetachedSignature(
  originalFile: File,
  signatureFile: File,
): Promise<VerificationResult> {
  try {
    const sigBinary = arrayBufferToBinaryString(await signatureFile.arrayBuffer());
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(sigBinary)) as forge.pkcs7.PkcsSignedData;

    const signer = p7.certificates?.[0];
    const signerCN = signer ? commonName(signer.subject.attributes) : "—";
    const issuerCN = signer ? commonName(signer.issuer.attributes) : "—";

    const rawSigner = (p7 as unknown as { signers?: Array<{ authenticatedAttributes?: Array<{ type: string; value: unknown }> }> })
      .signers?.[0];
    const attrs = rawSigner?.authenticatedAttributes ?? [];

    const digestAttr = attrs.find((a) => a.type === forge.pki.oids.messageDigest);
    const timeAttr = attrs.find((a) => a.type === forge.pki.oids.signingTime);
    const signedAt = timeAttr?.value ? new Date(String(timeAttr.value)) : null;

    if (!digestAttr?.value) {
      return { valid: false, signerCN, issuerCN, signedAt, reason: "Assinatura sem messageDigest." };
    }

    const original = arrayBufferToBinaryString(await originalFile.arrayBuffer());
    const md = forge.md.sha256.create();
    md.update(original);
    const expected = md.digest().getBytes();

    const embedded = String(digestAttr.value);
    const valid = embedded === expected;

    return {
      valid,
      signerCN,
      issuerCN,
      signedAt: signedAt && !Number.isNaN(signedAt.getTime()) ? signedAt : null,
      reason: valid ? undefined : "O arquivo não corresponde à assinatura (conteúdo alterado).",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SignatureError(`Não foi possível verificar a assinatura: ${message}`, "VERIFY_FAILED");
  }
}
