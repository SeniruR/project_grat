import { buildEmailDocument } from "./copyEmail";
import {
  extractEmailBodyHtml,
  extractEmailHeadInner,
} from "./emailHtml";

const RASTER_PIXEL_RATIO = 2;

/** Guess email width from Canva / table markup. */
export function inferEmailWidth(html: string, fallback = 600) {
  const slice = html.slice(0, 80_000);
  const patterns = [
    /max-width:\s*(\d+)px/i,
    /\bwidth[=:]\s*["']?(\d{3,4})/i,
    /<table[^>]*\bwidth=["']?(\d{3,4})/i,
  ];
  for (const re of patterns) {
    const m = re.exec(slice);
    if (m) {
      const w = Number(m[1]);
      if (Number.isFinite(w) && w >= 280 && w <= 900) return Math.round(w);
    }
  }
  return fallback;
}

function buildRasterSrcDoc(html: string, width: number) {
  const head = extractEmailHeadInner(html);
  const body = extractEmailBodyHtml(buildEmailDocument(html));
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
${head}
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: ${width}px;
    background: #ffffff;
    overflow: visible;
  }
  body {
    font-family: Arial, Helvetica, sans-serif;
  }
  img { max-width: 100%; height: auto; display: block; }
  table { border-collapse: collapse; }
</style>
</head>
<body>${body}</body>
</html>`;
}

async function waitForFrameResources(doc: Document) {
  const images = [...doc.images];
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        }),
    ),
  );
  try {
    await doc.fonts?.ready;
  } catch {
    /* optional */
  }
  await new Promise((r) => setTimeout(r, 400));
}

async function inlineDocumentImages(doc: Document) {
  const imgs = [...doc.images];
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith("data:")) return;
      try {
        const res = await fetch(src, { credentials: "include" });
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        img.src = dataUrl;
      } catch {
        /* keep original src */
      }
    }),
  );
}

async function rasterizeWithHtmlToImage(
  node: HTMLElement,
  width: number,
  height: number,
): Promise<string> {
  const mod = await import("html-to-image");
  return mod.toPng(node, {
    width,
    height,
    pixelRatio: RASTER_PIXEL_RATIO,
    cacheBust: true,
    skipFonts: false,
    backgroundColor: "#ffffff",
  });
}

/** Fallback when html-to-image is not installed. */
async function rasterizeWithSvgForeignObject(
  node: HTMLElement,
  width: number,
  height: number,
): Promise<string> {
  const xmlns = "http://www.w3.org/1999/xhtml";
  const serialized = new XMLSerializer().serializeToString(node);
  const wrapped = serialized.includes(`xmlns="${xmlns}"`)
    ? serialized
    : serialized.replace("<body", `<body xmlns="${xmlns}"`);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <foreignObject width="100%" height="100%">
    ${wrapped}
  </foreignObject>
</svg>`;

  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("SVG raster failed"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width * RASTER_PIXEL_RATIO;
    canvas.height = height * RASTER_PIXEL_RATIO;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function rasterizeNode(
  node: HTMLElement,
  width: number,
  height: number,
): Promise<string> {
  try {
    return await rasterizeWithHtmlToImage(node, width, height);
  } catch {
    return rasterizeWithSvgForeignObject(node, width, height);
  }
}

/**
 * Rasterize email HTML to PNG (browser). Used for Canva imports so Outlook
 * paste matches the design pixel-for-pixel.
 */
export async function rasterizeEmailHtmlToPng(
  html: string,
  width = inferEmailWidth(html),
): Promise<{ dataUrl: string; width: number; height: number }> {
  const w = Math.max(280, Math.min(900, Math.round(width)));
  const iframe = document.createElement("iframe");
  iframe.setAttribute(
    "style",
    `position:fixed;left:-12000px;top:0;width:${w}px;height:12000px;border:0;visibility:hidden;`,
  );
  iframe.sandbox = "allow-same-origin";
  iframe.srcdoc = buildRasterSrcDoc(html, w);
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error("Email preview timed out.")),
        30_000,
      );
      iframe.onload = () => {
        window.clearTimeout(timer);
        resolve();
      };
    });

    const doc = iframe.contentDocument;
    if (!doc?.body) {
      throw new Error("Could not read email preview document.");
    }

    await waitForFrameResources(doc);
    await inlineDocumentImages(doc);
    await waitForFrameResources(doc);

    const height = Math.min(
      16_000,
      Math.max(400, Math.ceil(doc.body.scrollHeight) + 4),
    );

    const dataUrl = await rasterizeNode(doc.body, w, height);

    return {
      dataUrl,
      width: w,
      height: Math.round(height),
    };
  } finally {
    iframe.remove();
  }
}

export async function rasterizeEmailHtmlToFile(
  html: string,
  width?: number,
  fileName = "canva-preview.png",
): Promise<{ file: File; width: number; height: number }> {
  const { dataUrl, width: w, height } = await rasterizeEmailHtmlToPng(
    html,
    width,
  );
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return {
    file: new File([blob], fileName, { type: "image/png" }),
    width: w,
    height,
  };
}
