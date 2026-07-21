/**
 * Compressão client-side de imagens antes de enviar para a IA.
 *
 * - Só atua em imagens rasterizáveis (JPEG/PNG/WEBP/HEIC quando o browser suporta).
 * - PDFs e outros formatos passam sem alteração.
 * - Redimensiona mantendo proporção, com lado maior = MAX_DIMENSION.
 * - Reencoda como JPEG qualidade JPEG_QUALITY.
 * - Se o resultado ficar MAIOR que o original, mantém o original.
 */

// Alinhado à rasterização de PDF (pdf-to-image.ts) para que o MESMO documento
// tenha a mesma qualidade quer venha como imagem, quer como PDF. 1600px preserva
// legibilidade de OCR em documentos densos (letra pequena); custa mais tokens de
// input no Gemini (fatura por tile de 768px) que os 1024px anteriores, trade-off
// aceito em favor da precisão da extração.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;
const COMPRESSIBLE_TYPES = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;

export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file || !COMPRESSIBLE_TYPES.test(file.type)) return file;
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const largest = Math.max(width, height);
    const scale = largest > MAX_DIMENSION ? MAX_DIMENSION / largest : 1;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    // Reamostragem de alta qualidade no downscale (evita serrilhado/perda extra).
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.(png|webp|heic|heif|jpe?g)$/i, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
