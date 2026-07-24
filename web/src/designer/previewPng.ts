import type { Canvas } from "fabric";
import { dataUrlToBlob, type DesignerDesignJson } from "./compile";

/** Export scale for compiled PNG (2× = sharper Outlook paste / retina preview). */
export const PREVIEW_PNG_MULTIPLIER = 2;

/** Rasterize the live Fabric canvas at PREVIEW_PNG_MULTIPLIER × design pixels. */
export async function canvasToPreviewPngDataUrl(
  canvas: Canvas,
  frame?: DesignerDesignJson["frame"],
): Promise<string> {
  // Drop selection handles so they don't appear in the preview image.
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  // Two frames: let Fabric finish any pending image/layout paints.
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  const multiplier = PREVIEW_PNG_MULTIPLIER;
  const width = Math.round(canvas.getWidth() * multiplier);
  const height = Math.round(canvas.getHeight() * multiplier);

  // Prefer toCanvasElement → draw onto a clean bitmap so retina CSS size
  // mismatches on the live stage cannot corrupt the export.
  const source = canvas.toCanvasElement(multiplier);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) {
    return canvas.toDataURL({
      format: "png",
      multiplier,
      enableRetinaScaling: false,
    });
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  const raw = out.toDataURL("image/png");

  if (!frame || (frame.radius <= 0 && frame.borderWidth <= 0)) {
    return raw;
  }

  return bakeFrameIntoPngDataUrl(raw, frame, multiplier);
}

/** Clip corner radius + stroke into a PNG (lossless). */
export function bakeFrameIntoPngDataUrl(
  dataUrl: string,
  frame: { radius: number; borderWidth: number; borderColor: string },
  multiplier = 1,
): Promise<string> {
  const radius = Math.max(0, frame.radius) * multiplier;
  const borderW = Math.max(0, frame.borderWidth) * multiplier;
  if (radius <= 0 && borderW <= 0) return Promise.resolve(dataUrl);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);

        const inset = borderW / 2;
        const rr = Math.min(radius, (w - borderW) / 2, (h - borderW) / 2);
        const clipR = Math.max(0, rr - inset);
        roundRectPath(ctx, inset, inset, w - borderW, h - borderW, clipR);
        ctx.save();
        ctx.clip();
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();

        if (borderW > 0) {
          ctx.beginPath();
          roundRectPath(ctx, inset, inset, w - borderW, h - borderW, clipR);
          ctx.strokeStyle = frame.borderColor || "#1c2420";
          ctx.lineWidth = borderW;
          ctx.stroke();
        }

        resolve(c.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Failed to process framed PNG preview"));
    img.src = dataUrl;
  });
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  // Correct 4-corner arcTo path (a bad bottom-left arc previously clipped
  // the PNG into a white diagonal triangle).
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Turn a data URL into a File ready for uploadTemplateAsset(..., "compiled"). */
export function previewDataUrlToFile(
  dataUrl: string,
  name = "preview.png",
): File {
  const blob = dataUrlToBlob(dataUrl);
  const type = blob.type || "image/png";
  const ext = type.includes("png")
    ? ".png"
    : type.includes("webp")
      ? ".webp"
      : ".jpg";
  const base = name.replace(/\.(png|jpe?g|webp)$/i, "");
  return new File([blob], `${base}${ext}`, { type });
}
