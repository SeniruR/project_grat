import { buildCompiledEmailHtml } from "./emailHtml";

/**
 * Render the first page of a PDF to a PNG Blob (for image-email fallback).
 */
export async function pdfFirstPageToPngBlob(file: File): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  // Vite-friendly worker
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not render PDF page.");

  // pdfjs-dist 4.x: canvasContext + viewport
  await page.render({
    canvasContext: ctx,
    viewport,
  } as Parameters<typeof page.render>[0]).promise;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PDF render failed"))),
      "image/png",
    );
  });
  return blob;
}

export async function fileToDesignImageBlob(file: File): Promise<{
  blob: Blob;
  fileName: string;
  width: number;
}> {
  const type = file.type || "";
  const name = file.name || "design.png";

  if (/pdf$/i.test(type) || /\.pdf$/i.test(name)) {
    const blob = await pdfFirstPageToPngBlob(file);
    const dims = await readImageSize(blob);
    return {
      blob,
      fileName: name.replace(/\.pdf$/i, ".png"),
      width: Math.min(800, Math.max(320, dims.width)),
    };
  }

  if (
    !/^image\/(jpeg|png|gif|webp)$/i.test(type) &&
    !/\.(jpe?g|png|gif|webp)$/i.test(name)
  ) {
    throw new Error("Use a PNG, JPEG, GIF, WebP, or PDF file.");
  }

  const dims = await readImageSize(file);
  return {
    blob: file,
    fileName: name.replace(/\s+/g, "-"),
    width: Math.min(800, Math.max(320, dims.width)),
  };
}

function readImageSize(src: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(src);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions."));
    };
    img.src = url;
  });
}

/** Outlook-safe single-image email body (text not selectable). */
export function buildImageEmailHtml(imageUrl: string, width: number, alt?: string) {
  return buildCompiledEmailHtml({ imageUrl, width, alt });
}
