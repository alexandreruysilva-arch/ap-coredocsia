/**
 * Converte as N primeiras páginas de um PDF em um File JPEG (client-side),
 * empilhando as páginas verticalmente em uma única imagem. Quando o browser
 * suporta OffscreenCanvas, a rasterização acontece off-thread (via helpers do
 * pdfjs) — reduzindo travamentos da UI em PDFs grandes.
 */
import { cropCanvasHalf, type CropMode } from "./image-crop";

// Limites seguros de canvas para todos os navegadores (Chrome/Firefox ~16384px
// por lado; iOS Safari ~16,7M px de área). Ao empilhar muitas páginas o
// composto pode estourar esses limites e o navegador devolve canvas em branco /
// blob nulo — então reduzimos a escala global do composto para caber.
const MAX_CANVAS_SIDE = 15000;
const MAX_CANVAS_AREA = 16_000_000;

export async function pdfPagesToJpeg(
  file: File,
  opts: { maxPages?: number; maxDimension?: number; quality?: number; cropMode?: CropMode } = {},
): Promise<File> {
  // maxPages === 0 significa "todas as páginas".
  const maxPages = opts.maxPages === 0 ? 0 : Math.max(1, Math.floor(opts.maxPages ?? 1));
  const maxDimension = opts.maxDimension ?? 1600;
  const quality = opts.quality ?? 0.85;
  const cropMode = opts.cropMode ?? "none";

  if (file.type !== "application/pdf") return file;
  if (typeof document === "undefined") return file;

  const canUseOffscreen =
    typeof OffscreenCanvas !== "undefined" &&
    typeof (OffscreenCanvas.prototype as any).convertToBlob === "function";

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: buf.slice(0),
    isOffscreenCanvasSupported: canUseOffscreen,
    isImageDecoderSupported: canUseOffscreen,
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;

  type RenderedPage = {
    canvas: HTMLCanvasElement | OffscreenCanvas;
    width: number;
    height: number;
  };

  const makeCanvas = (w: number, h: number): RenderedPage["canvas"] => {
    if (canUseOffscreen) return new OffscreenCanvas(w, h);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };

  try {
    const total = maxPages === 0 ? pdf.numPages : Math.min(maxPages, pdf.numPages);
    const rendered: RenderedPage[] = [];

    for (let p = 1; p <= total; p++) {
      const page = await pdf.getPage(p);
      const baseViewport = page.getViewport({ scale: 1 });
      const largest = Math.max(baseViewport.width, baseViewport.height);
      const scale = largest > maxDimension ? maxDimension / largest : 2;
      const viewport = page.getViewport({ scale });

      const w = Math.ceil(viewport.width);
      const h = Math.ceil(viewport.height);
      const canvas = makeCanvas(w, h);
      const ctx = (canvas as any).getContext("2d");
      if (!ctx) throw new Error("Canvas 2D indisponível");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      await page.render({ canvasContext: ctx, viewport, canvas: canvas as any }).promise;
      rendered.push({ canvas, width: w, height: h });
    }

    // Empilha verticalmente as páginas em um único canvas final.
    const naiveWidth = Math.max(...rendered.map((r) => r.width));
    const gap = rendered.length > 1 ? 16 : 0;
    const naiveHeight = rendered.reduce((sum, r) => sum + r.height, 0) + gap * (rendered.length - 1);

    // Trava de limite de canvas: reduz a escala global se o composto ultrapassar
    // os limites de lado/área do navegador (evita canvas em branco em PDFs longos).
    let s = Math.min(1, MAX_CANVAS_SIDE / naiveWidth, MAX_CANVAS_SIDE / naiveHeight);
    if (naiveWidth * s * (naiveHeight * s) > MAX_CANVAS_AREA) {
      s = Math.min(s, Math.sqrt(MAX_CANVAS_AREA / (naiveWidth * naiveHeight)));
    }
    const finalWidth = Math.max(1, Math.floor(naiveWidth * s));
    const scaledGap = gap * s;

    let stackedHeight = 0;
    const placements = rendered.map((r) => {
      const w = Math.max(1, Math.floor(r.width * s));
      const h = Math.max(1, Math.floor(r.height * s));
      const y = stackedHeight;
      stackedHeight += h + scaledGap;
      return { canvas: r.canvas, w, h, x: Math.floor((finalWidth - w) / 2), y: Math.floor(y) };
    });
    const finalHeight = Math.max(1, Math.floor(stackedHeight - scaledGap));

    const composite = makeCanvas(finalWidth, finalHeight);
    const cctx = (composite as any).getContext("2d");
    if (!cctx) throw new Error("Canvas 2D indisponível");
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = "high";
    cctx.fillStyle = "#ffffff";
    cctx.fillRect(0, 0, finalWidth, finalHeight);

    for (const p of placements) {
      cctx.drawImage(p.canvas as any, p.x, p.y, p.w, p.h);
    }

    // Corta no mesmo passo de canvas (antes da única codificação JPEG).
    const outCanvas = cropCanvasHalf(composite, cropMode);

    let blob: Blob | null = null;
    if (canUseOffscreen && outCanvas instanceof OffscreenCanvas) {
      blob = await outCanvas.convertToBlob({ type: "image/jpeg", quality });
    } else {
      blob = await new Promise<Blob | null>((resolve) =>
        (outCanvas as HTMLCanvasElement).toBlob(resolve, "image/jpeg", quality),
      );
    }
    if (!blob) throw new Error("Falha ao gerar JPEG do PDF");

    const pageSuffix = total > 1 ? `-p1-${total}` : "";
    const cropSuffix = cropMode === "top" ? "-topo" : cropMode === "bottom" ? "-base" : "";
    const newName = file.name.replace(/\.pdf$/i, "") + `${pageSuffix}${cropSuffix}.jpg`;
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
  }
}

/** Alias legado — mantido por compatibilidade (equivale a maxPages=1). */
export async function pdfFirstPageToJpeg(
  file: File,
  opts: { maxDimension?: number; quality?: number } = {},
): Promise<File> {
  return pdfPagesToJpeg(file, { ...opts, maxPages: 1 });
}
