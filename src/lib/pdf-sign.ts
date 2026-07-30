/**
 * Geração de PDF assinado digitalmente (PAdES / adbe.pkcs7.detached) 100% no
 * navegador.
 *
 * Fluxo:
 *  1. O arquivo de entrada (imagem ou PDF) é convertido/normalizado em um PDF.
 *  2. Um campo de assinatura (AcroForm /Sig) é inserido com um placeholder de
 *     /ByteRange e /Contents.
 *  3. O digest do PDF (excluindo a lacuna de /Contents) é assinado em PKCS#7
 *     destacado com a chave privada do PFX — que permanece somente em memória.
 *  4. O DER da assinatura é gravado dentro da lacuna, produzindo um PDF único e
 *     autoverificável (Adobe Reader consegue validar).
 */
import forge from "node-forge";
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  rgb,
} from "pdf-lib";
import {
  SignatureError,
  type LoadedCertificate,
  type VerificationResult,
} from "@/lib/pkcs7-sign";
import { buildDetachedCms, parseSignedAttributes } from "@/lib/cades";

/** Tamanho reservado (em bytes) para o envelope PKCS#7 dentro do PDF. */
const SIGNATURE_BYTE_LENGTH = 16384;
/** Placeholder de mesmo comprimento de um inteiro grande, como no node-signpdf. */
const BYTE_RANGE_PLACEHOLDER = "**********";

export interface SignedPdfResult {
  fileName: string;
  blob: Blob;
  /** SHA-256 do PDF final (hex) — útil para conferência/auditoria. */
  sha256: string;
}

function latin1Decode(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

function writeAscii(target: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) target[offset + i] = text.charCodeAt(i) & 0xff;
}

function binaryStringFromBytes(bytes: Uint8Array): string {
  return latin1Decode(bytes);
}

/** Converte formatos que o pdf-lib não embute nativamente (webp, bmp…) em PNG. */
async function toPngBytes(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new SignatureError("Não foi possível processar a imagem.", "SIGN_FAILED");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new SignatureError("Falha ao converter a imagem para PNG.", "SIGN_FAILED");
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Constrói (ou reaproveita) o PDF base a partir do arquivo enviado.
 * Imagens viram uma página com a proporção original preservada.
 */
async function buildBasePdf(file: File): Promise<PDFDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = file.type || "";

  if (mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    try {
      return await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch {
      throw new SignatureError("PDF inválido ou protegido por senha.", "SIGN_FAILED");
    }
  }

  const pdf = await PDFDocument.create();
  const image =
    mime === "image/jpeg" || /\.jpe?g$/i.test(file.name)
      ? await pdf.embedJpg(bytes)
      : mime === "image/png" || /\.png$/i.test(file.name)
        ? await pdf.embedPng(bytes)
        : await pdf.embedPng(await toPngBytes(file));

  const page = pdf.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  return pdf;
}

/** Carimbo visual discreto no rodapé da primeira página. */
async function stampSignature(pdf: PDFDocument, signer: LoadedCertificate): Promise<void> {
  const [page] = pdf.getPages();
  if (!page) return;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const size = Math.max(6, Math.min(9, page.getWidth() / 70));
  const text = `Assinado digitalmente por ${signer.subjectCN} — ${new Date().toLocaleString("pt-BR")}`;
  page.drawRectangle({
    x: 8,
    y: 6,
    width: Math.min(page.getWidth() - 16, font.widthOfTextAtSize(text, size) + 12),
    height: size + 8,
    color: rgb(1, 1, 1),
    opacity: 0.72,
  });
  page.drawText(text, { x: 14, y: 10, size, font, color: rgb(0.1, 0.2, 0.45) });
}

/** Insere o campo AcroForm /Sig com placeholders de ByteRange e Contents. */
function addSignaturePlaceholder(pdf: PDFDocument, signer: LoadedCertificate): void {
  const context = pdf.context;

  const signatureDict = context.obj({
    Type: "Sig",
    Filter: "Adobe.PPKLite",
    SubFilter: "adbe.pkcs7.detached",
    ByteRange: [
      PDFNumber.of(0),
      PDFName.of(BYTE_RANGE_PLACEHOLDER),
      PDFName.of(BYTE_RANGE_PLACEHOLDER),
      PDFName.of(BYTE_RANGE_PLACEHOLDER),
    ],
    Contents: PDFHexString.of("0".repeat(SIGNATURE_BYTE_LENGTH * 2)),
    Reason: PDFString.of("Assinatura digital de documento"),
    Name: PDFString.of(signer.subjectCN),
    M: PDFString.fromDate(new Date()),
  });
  const signatureRef = context.register(signatureDict);

  const [page] = pdf.getPages();
  const widget = context.obj({
    Type: "Annot",
    Subtype: "Widget",
    FT: "Sig",
    Rect: [0, 0, 0, 0],
    V: signatureRef,
    T: PDFString.of("Signature1"),
    F: 4,
    P: page.ref,
  });
  const widgetRef = context.register(widget);

  const annots = page.node.Annots();
  if (annots) annots.push(widgetRef);
  else page.node.set(PDFName.of("Annots"), context.obj([widgetRef]));

  pdf.catalog.set(
    PDFName.of("AcroForm"),
    context.obj({ SigFlags: 3, Fields: [widgetRef] }),
  );
}

/** Calcula o PKCS#7 destacado sobre as faixas do ByteRange e injeta no PDF. */
function embedSignature(pdfBytes: Uint8Array, signer: LoadedCertificate): Uint8Array {
  const raw = latin1Decode(pdfBytes);

  const brMatch = /\/ByteRange\s*\[([^\]]*)\]/.exec(raw);
  if (!brMatch) throw new SignatureError("Placeholder de assinatura não encontrado.", "SIGN_FAILED");
  const brStart = brMatch.index;
  const brLength = brMatch[0].length;

  const contentsTagIndex = raw.indexOf("/Contents", brStart);
  const gapStart = raw.indexOf("<", contentsTagIndex);
  const gapEnd = raw.indexOf(">", gapStart);
  if (contentsTagIndex < 0 || gapStart < 0 || gapEnd < 0) {
    throw new SignatureError("Estrutura de assinatura inválida no PDF.", "SIGN_FAILED");
  }

  const before = gapStart + 1;
  const after = gapEnd;
  const byteRange = [0, gapStart, after + 1, pdfBytes.length - (after + 1)];

  let byteRangeText = `/ByteRange [${byteRange.join(" ")}]`;
  if (byteRangeText.length > brLength) {
    throw new SignatureError("Espaço insuficiente para o ByteRange.", "SIGN_FAILED");
  }
  byteRangeText = byteRangeText.padEnd(brLength, " ");

  const output = new Uint8Array(pdfBytes);
  writeAscii(output, brStart, byteRangeText);

  // Conteúdo assinado: tudo, exceto a lacuna hexadecimal de /Contents.
  const signable = new Uint8Array(byteRange[1] + byteRange[3]);
  signable.set(output.subarray(0, byteRange[1]), 0);
  signable.set(output.subarray(byteRange[2]), byteRange[1]);

  // CMS destacado conforme ICP-Brasil: sha256WithRSAEncryption + signingCertificateV2.
  const der = buildDetachedCms({
    content: binaryStringFromBytes(signable),
    certificate: signer.certificate,
    privateKey: signer.privateKey as forge.pki.rsa.PrivateKey,
    chain: signer.chain,
  });
  if (der.length > SIGNATURE_BYTE_LENGTH) {
    throw new SignatureError("Assinatura maior que o espaço reservado no PDF.", "SIGN_FAILED");
  }

  let hex = "";
  for (let i = 0; i < der.length; i += 1) {
    hex += (der.charCodeAt(i) & 0xff).toString(16).padStart(2, "0");
  }
  hex = hex.padEnd(after - before, "0");
  writeAscii(output, before, hex);

  return output;
}

/**
 * Converte imagem/PDF em um PDF com assinatura digital embutida (PAdES básico).
 */
export async function signFileAsPdf(
  file: File,
  signer: LoadedCertificate,
  opts: { stamp?: boolean } = {},
): Promise<SignedPdfResult> {
  if (signer.expired) {
    throw new SignatureError(
      `Certificado fora da validade (expirou em ${signer.validTo.toLocaleDateString("pt-BR")}).`,
      "EXPIRED",
    );
  }

  try {
    const pdf = await buildBasePdf(file);
    if (opts.stamp !== false) await stampSignature(pdf, signer);
    addSignaturePlaceholder(pdf, signer);

    const placeholderBytes = await pdf.save({ useObjectStreams: false });
    const signedBytes = embedSignature(placeholderBytes, signer);

    const md = forge.md.sha256.create();
    md.update(binaryStringFromBytes(signedBytes));

    const baseName = file.name.replace(/\.[^.]+$/, "");
    return {
      fileName: `${baseName}-assinado.pdf`,
      blob: new Blob([signedBytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
      sha256: md.digest().toHex(),
    };
  } catch (error) {
    if (error instanceof SignatureError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new SignatureError(`Falha ao gerar PDF assinado: ${message}`, "SIGN_FAILED");
  }
}

/**
 * Verifica um PDF assinado (adbe.pkcs7.detached) diretamente: extrai o
 * /ByteRange e o CMS de /Contents, recalcula o digest do conteúdo coberto e
 * compara com o atributo autenticado messageDigest.
 */
export async function verifySignedPdf(file: File): Promise<VerificationResult> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const raw = latin1Decode(bytes);

    const brMatch = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(raw);
    if (!brMatch) {
      throw new SignatureError(
        "Este PDF não contém uma assinatura digital embutida.",
        "VERIFY_FAILED",
      );
    }
    const [a, b, c, d] = brMatch.slice(1).map(Number);

    const gapStart = raw.indexOf("<", raw.indexOf("/Contents", brMatch.index));
    const gapEnd = raw.indexOf(">", gapStart);
    const hex = raw.slice(gapStart + 1, gapEnd).replace(/[^0-9a-fA-F]/g, "").replace(/(00)+$/, "");
    let der = "";
    for (let i = 0; i + 1 < hex.length; i += 2) {
      der += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }

    const p7 = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(der),
    ) as forge.pkcs7.PkcsSignedData;
    const cert = p7.certificates?.[0];
    const attrOf = (attrs: forge.pki.CertificateField[] | undefined) =>
      attrs?.find((x) => x.shortName === "CN")?.value ?? "—";
    const signerCN = String(attrOf(cert?.subject.attributes));
    const issuerCN = String(attrOf(cert?.issuer.attributes));

    const { messageDigest, signingTime } = parseSignedAttributes(der);
    if (!messageDigest) {
      return {
        valid: false,
        signerCN,
        issuerCN,
        signedAt: signingTime,
        reason: "Assinatura sem messageDigest.",
      };
    }

    const signable = new Uint8Array(b + d);
    signable.set(bytes.subarray(a, a + b), 0);
    signable.set(bytes.subarray(c, c + d), b);

    const md = forge.md.sha256.create();
    md.update(binaryStringFromBytes(signable));
    const valid = md.digest().getBytes() === messageDigest;

    return {
      valid,
      signerCN,
      issuerCN,
      signedAt: signingTime && !Number.isNaN(signingTime.getTime()) ? signingTime : null,
      reason: valid ? undefined : "O PDF foi alterado após a assinatura.",
    };
  } catch (error) {
    if (error instanceof SignatureError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new SignatureError(`Não foi possível verificar o PDF: ${message}`, "VERIFY_FAILED");
  }
}
