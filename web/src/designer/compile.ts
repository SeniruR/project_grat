const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const DESIGN_WIDTH = 600;
export const DESIGN_HEIGHT = 800;

export type DesignerDesignJson = {
  mode: "designer";
  width: number;
  height: number;
  canvas: Record<string, unknown>;
  fields: string[];
  /** Visual frame around the design surface (not email body) */
  frame?: {
    radius: number;
    borderWidth: number;
    borderColor: string;
  };
};

/** Legacy single-image email body (kept for older stored versions). Prefer exportCanvasToEmailHtml. */
export function buildCompiledEmailHtml(input: {
  imageUrl: string;
  width: number;
  alt?: string;
}) {
  const img = `<img src="${input.imageUrl}" width="${input.width}" alt="${escapeAttr(input.alt ?? "Gratitude card")}" style="display:block;border:0;outline:none;text-decoration:none;width:100%;max-width:${input.width}px;height:auto;" />`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;max-width:${input.width}px;margin:0 auto;"><tr><td style="padding:0;">${img}</td></tr></table>`;
}

/** Bake corner radius + border into a JPEG so Word Outlook and web clients match. */
export function bakeFrameIntoJpegDataUrl(
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
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);

        const inset = borderW / 2;
        const rr = Math.min(radius, (w - borderW) / 2, (h - borderW) / 2);
        roundRectPath(ctx, inset, inset, w - borderW, h - borderW, Math.max(0, rr - inset));
        ctx.save();
        ctx.clip();
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();

        if (borderW > 0) {
          ctx.beginPath();
          roundRectPath(ctx, inset, inset, w - borderW, h - borderW, Math.max(0, rr - inset));
          ctx.strokeStyle = frame.borderColor || "#1c2420";
          ctx.lineWidth = borderW;
          ctx.stroke();
        }

        resolve(canvas.toDataURL("image/jpeg", 0.9));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Failed to process framed preview image"));
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
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** True when HTML is already a full document (has doctype or <html>). */
export function isFullHtmlDocument(html: string) {
  return /^\s*<!DOCTYPE\s+html/i.test(html) || /^\s*<html[\s>]/i.test(html);
}

/** Body inner HTML only — safe to wrap with header/footer or inject into a shell. */
export function extractEmailBodyHtml(html: string) {
  const t = html.trim();
  if (!t) return "";
  if (!isFullHtmlDocument(t)) return t;
  const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(t);
  return m ? m[1].trim() : t;
}

/** Apply optional org header/footer around a stored card body. */
export function wrapWithHeaderFooter(
  bodyHtml: string,
  headerHtml?: string | null,
  footerHtml?: string | null,
) {
  const body = extractEmailBodyHtml(bodyHtml);
  return `${headerHtml?.trim() ?? ""}${body}${footerHtml?.trim() ?? ""}`;
}

export function absoluteUploadUrl(storageKey: string) {
  const key = storageKey.replace(/\\/g, "/");
  return `${API_URL}/uploads/${key}`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(meta)?.[1] ?? "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function collectFieldNames(canvasJson: {
  objects?: Array<Record<string, unknown>>;
}): string[] {
  const fields = new Set<string>();
  for (const obj of canvasJson.objects ?? []) {
    const key = obj.gratField;
    if (typeof key === "string" && key.trim()) fields.add(key.trim());
  }
  return [...fields];
}
