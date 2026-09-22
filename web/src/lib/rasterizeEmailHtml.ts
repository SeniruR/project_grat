import html2canvas from "html2canvas";
import { buildEmailDocument } from "./copyEmail";
import {
  extractEmailBodyHtml,
  extractEmailHeadInner,
} from "./emailHtml";
import { resolveMediaUrl } from "./mediaUrl";

/** 1× keeps compiled previews under the upload cap; 2× often exceeded 5MB. */
const RASTER_PIXEL_RATIO = 1;
const COMPILED_UPLOAD_BUDGET = 4.5 * 1024 * 1024;

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

/**
 * True content height of an email document in an iframe.
 *
 * Never expands the iframe to a huge temp height - Canva / email CSS often
 * uses height:100%, which then reports ~10000px and leaves empty canvas.
 * Measure painted element bounds with html/body forced to height:auto.
 */
export function measureEmailContentHeight(
  doc: Document,
  iframe?: HTMLIFrameElement | null,
): number {
  const body = doc.body;
  const htmlEl = doc.documentElement;
  if (!body) return 400;

  const measureStyle = doc.createElement("style");
  measureStyle.setAttribute("data-grat-h-measure", "1");
  measureStyle.textContent = `
    html, body {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
    }
  `;
  (doc.head ?? body).appendChild(measureStyle);

  const prevIframeH = iframe?.style.height ?? "";
  // Keep the frame short so %-based wrappers cannot inflate to thousands of px.
  if (iframe) {
    iframe.style.height = "1px";
    void body.offsetHeight;
  }

  const bodyRect = body.getBoundingClientRect();
  const bodyTop = bodyRect.top;
  const emailW = Math.max(bodyRect.width, htmlEl.clientWidth, 1);

  let contentBottom = 0;
  let artboardBottom = 0;

  const consider = (el: Element) => {
    try {
      const he = el as HTMLElement;
      const rect = he.getBoundingClientRect();
      if (rect.width < 1 && rect.height < 1) return;
      // Ignore elements inflated by 100vh / % of a tall ancestor.
      if (rect.height >= 9000) return;
      const bottom = rect.bottom - bodyTop;
      contentBottom = Math.max(contentBottom, bottom);
      // Root-ish boxes nearly as wide as the email are usually the artboard.
      if (rect.width >= emailW * 0.9 && rect.height >= 120 && rect.height < 9000) {
        artboardBottom = Math.max(artboardBottom, bottom);
      }
    } catch {
      /* ignore */
    }
  };

  for (const child of Array.from(body.children)) consider(child);
  body.querySelectorAll("table, img").forEach(consider);
  body
    .querySelectorAll(
      '[style*="position:absolute"], [style*="position: absolute"]',
    )
    .forEach(consider);

  const scrollH = Math.max(body.scrollHeight, htmlEl.scrollHeight);

  measureStyle.remove();
  if (iframe) iframe.style.height = prevIframeH;

  let measured = artboardBottom > 120 ? artboardBottom : contentBottom;
  if (measured < 120 && scrollH >= 120 && scrollH < 4000) measured = scrollH;
  else if (
    scrollH >= 120 &&
    scrollH < 4000 &&
    Math.abs(scrollH - measured) < 80
  ) {
    measured = Math.max(measured, scrollH);
  }

  if (measured >= 9000 || measured < 120) {
    measured = artboardBottom > 120 ? artboardBottom : 800;
  }

  return Math.min(8_000, Math.max(120, Math.ceil(measured)));
}

function stripUnsupportedCssColors(css: string) {
  return css
    .replace(/oklch\([^)]*\)/gi, "#333333")
    .replace(/oklab\([^)]*\)/gi, "#333333")
    .replace(/\blab\([^)]*\)/gi, "#333333")
    .replace(/\blch\([^)]*\)/gi, "#333333")
    .replace(/color-mix\([^)]*\)/gi, "#333333")
    .replace(/\bcolor\([^)]*\)/gi, "#333333");
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  const fetchUrl = resolveMediaUrl(url) ?? url;
  const attempts: Array<RequestInit> = [
    { credentials: "include", mode: "cors" },
    { credentials: "omit", mode: "cors" },
  ];
  for (const init of attempts) {
    try {
      const res = await fetch(fetchUrl, init);
      if (!res.ok) continue;
      return await blobToDataUrl(await res.blob());
    } catch {
      /* try next */
    }
  }
  return null;
}

async function inlineRemoteAssets(html: string): Promise<string> {
  const urls = new Set<string>();
  const collect = (raw: string) => {
    const t = raw.trim();
    if (!t || /^(data:|blob:|cid:|#)/i.test(t)) return;
    urls.add(t);
  };
  for (const m of html.matchAll(/\bsrc\s*=\s*(["'])([^"']+)\1/gi)) {
    collect(m[2]);
  }
  for (const m of html.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) {
    collect(m[2]);
  }

  let out = html;
  for (const url of urls) {
    const data = await fetchAsDataUrl(url);
    if (!data) continue;
    out = out.split(url).join(data);
  }
  return out;
}

async function waitForElementImages(root: HTMLElement) {
  const images = [...root.querySelectorAll("img")];
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          const done = () => resolve();
          if (img.complete && img.naturalWidth > 0) {
            done();
            return;
          }
          img.onload = done;
          img.onerror = done;
          window.setTimeout(done, 4000);
        }),
    ),
  );
}

/** True when the snapshot is an empty white rectangle (failed capture). */
async function dataUrlIsMostlyWhite(dataUrl: string): Promise<boolean> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read snapshot"));
    el.src = dataUrl;
  });
  const sampleW = Math.min(80, img.width);
  const sampleH = Math.min(80, img.height);
  if (sampleW < 2 || sampleH < 2) return true;
  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
  let white = 0;
  const total = sampleW * sampleH;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 248 && data[i + 1] > 248 && data[i + 2] > 248) white += 1;
  }
  return white / total > 0.97;
}

/**
 * Rasterize email HTML to PNG (browser). Used for Canva imports so Outlook
 * paste matches the design pixel-for-pixel.
 *
 * html-to-image uses SVG foreignObject; Canva HTML is not valid XML and
 * fails with "SVG raster failed". html2canvas draws to a canvas instead.
 */
export async function rasterizeEmailHtmlToPng(
  html: string,
  width = inferEmailWidth(html),
): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  pixelRatio: number;
}> {
  const w = Math.max(280, Math.min(900, Math.round(width)));
  const docHtml = stripUnsupportedCssColors(
    await inlineRemoteAssets(buildEmailDocument(html)),
  );
  const head = stripUnsupportedCssColors(extractEmailHeadInner(docHtml));
  const body = extractEmailBodyHtml(docHtml);

  const host = document.createElement("div");
  host.setAttribute("data-grat-raster", "1");
  host.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${w}px`,
    "background:#ffffff",
    "z-index:-1",
    "opacity:1",
    "pointer-events:none",
    "overflow:visible",
  ].join(";");
  host.innerHTML = `<style>
    #grat-raster-root, #grat-raster-root * { box-sizing: border-box; }
    #grat-raster-root { width:${w}px; margin:0; padding:0; background:#fff;
      font-family: Arial, Helvetica, sans-serif; }
    #grat-raster-root img { display:block; border:0; max-width:100%; }
    #grat-raster-root table { border-collapse: collapse; }
    ${head}
  </style><div id="grat-raster-root">${body}</div>`;
  document.body.appendChild(host);

  try {
    const root = host.querySelector("#grat-raster-root") as HTMLElement | null;
    if (!root) throw new Error("Could not build email preview.");
    await waitForElementImages(host);

    const height = Math.min(
      8_000,
      Math.max(120, Math.ceil(root.scrollHeight || root.offsetHeight || 800)),
    );
    host.style.height = `${height}px`;
    root.style.minHeight = `${height}px`;
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );

    const canvas = await html2canvas(root, {
      width: w,
      height,
      scale: RASTER_PIXEL_RATIO,
      backgroundColor: "#ffffff",
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: w,
      windowHeight: height,
      onclone: (clonedDoc) => {
        const clonedHost = clonedDoc.querySelector(
          "[data-grat-raster]",
        ) as HTMLElement | null;
        const clonedRoot = clonedDoc.querySelector(
          "#grat-raster-root",
        ) as HTMLElement | null;
        if (clonedHost) clonedHost.style.opacity = "1";
        if (clonedRoot) clonedRoot.style.opacity = "1";
      },
    });
    const dataUrl = canvas.toDataURL("image/png");
    if (await dataUrlIsMostlyWhite(dataUrl)) {
      throw new Error(
        "Could not draw this preview.",
      );
    }
    return {
      dataUrl,
      width: w,
      height: Math.round(height),
      pixelRatio: RASTER_PIXEL_RATIO,
    };
  } finally {
    host.remove();
  }
}

export async function rasterizeEmailHtmlToFile(
  html: string,
  width?: number,
  fileName = "canva-preview.png",
): Promise<{
  file: File;
  width: number;
  height: number;
  dataUrl: string;
  pixelRatio: number;
}> {
  const { dataUrl, width: w, height, pixelRatio } =
    await rasterizeEmailHtmlToPng(html, width);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const raw = new File([blob], fileName, { type: "image/png" });
  const file = await fileWithinUploadBudget(raw);
  return {
    file,
    width: w,
    height,
    dataUrl,
    pixelRatio,
  };
}

async function fileWithinUploadBudget(file: File): Promise<File> {
  if (file.size <= COMPILED_UPLOAD_BUDGET) return file;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  let w = bitmap.width;
  let h = bitmap.height;
  const pixels = w * h;
  const maxPixels = 2_000_000;
  if (pixels > maxPixels) {
    const s = Math.sqrt(maxPixels / pixels);
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Could not compress snapshot")),
      "image/jpeg",
      0.82,
    );
  });
  return new File([blob], file.name.replace(/\.png$/i, ".jpg"), {
    type: "image/jpeg",
  });
}
