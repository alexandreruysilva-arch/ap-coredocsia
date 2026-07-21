/**
 * Recorte horizontal simples de imagens rasterizáveis (JPEG/PNG/WEBP).
 * - "top": mantém a metade superior (0% → 50%)
 * - "bottom": mantém a metade inferior (50% → 100%)
 * - "none": retorna o arquivo original inalterado
 *
 * Arquivos não-imagem passam sem alteração.
 */
export type CropMode = "none" | "top" | "bottom";

const CROPPABLE_TYPES = /^image\/(jpeg|jpg|png|webp)$/i;

/**
 * Corta 50% (topo ou base) diretamente em um canvas já rasterizado, retornando
 * um novo canvas do mesmo tipo. Usado pelos produtores (pdf-to-image e
 * image-compress) para cortar ANTES da única codificação JPEG — evita o ciclo
 * redundante de codificar → decodificar → cortar → recodificar.
 */
export function cropCanvasHalf(
  source: HTMLCanvasElement | OffscreenCanvas,
  mode: CropMode,
): HTMLCanvasElement | OffscreenCanvas {
  if (mode === "none") return source;
  const width = source.width;
  const height = source.height;
  const halfH = Math.floor(height / 2);
  if (halfH <= 0) return source;
  const sy = mode === "bottom" ? height - halfH : 0;

  const isOffscreen = typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas;
  let dest: HTMLCanvasElement | OffscreenCanvas;
  if (isOffscreen) {
    dest = new OffscreenCanvas(width, halfH);
  } else {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = halfH;
    dest = c;
  }
  const ctx = (dest as HTMLCanvasElement).getContext("2d") as
    | CanvasRenderingContext2D
    | null;
  if (!ctx) return source;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, halfH);
  ctx.drawImage(source as CanvasImageSource, 0, sy, width, halfH, 0, 0, width, halfH);
  return dest;
}

export async function cropImageHalf(file: File, mode: CropMode): Promise<File> {
  if (!file || mode === "none") return file;
  if (!CROPPABLE_TYPES.test(file.type)) return file;
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const halfH = Math.floor(height / 2);
    if (halfH <= 0) {
      bitmap.close?.();
      return file;
    }
    const sy = mode === "bottom" ? height - halfH : 0;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = halfH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, halfH);
    ctx.drawImage(bitmap, 0, sy, width, halfH, 0, 0, width, halfH);
    bitmap.close?.();

    // O corte re-encoda uma imagem que normalmente JÁ é JPEG (saída de
    // pdf-to-image / image-compress). Qualidade alta (0.95) aqui torna essa
    // segunda geração de JPEG praticamente sem perda visível. O corte é 1:1
    // (mesma escala), então não há reamostragem/downscale envolvido.
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.95),
    );
    if (!blob) return file;

    const suffix = mode === "top" ? "-topo" : "-base";
    const newName = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + `${suffix}.jpg`;
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
