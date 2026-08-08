import {
  extractEmailBodyHtml,
  extractEmailHeadInner,
  isFullHtmlDocument,
} from "./emailHtml";

export type WhiteMarginCrop = {
  /** CSS px to remove from the top */
  top: number;
  /** CSS px to remove from the bottom */
  bottom: number;
  /** Content height after crop (CSS px) */
  height: number;
  /** Email width (CSS px) */
  width: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read email snapshot."));
    img.src = src;
  });
}

function rowIsBlank(
  data: Uint8ClampedArray,
  width: number,
  y: number,
  threshold: number,
  minRatio: number,
): boolean {
  let blank = 0;
  const row = y * width * 4;
  for (let x = 0; x < width; x++) {
    const i = row + x * 4;
    const a = data[i + 3] ?? 0;
    if (a < 12) {
      blank++;
      continue;
    }
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    // Near-white only - cream/beige card backgrounds are kept.
    if (r >= threshold && g >= threshold && b >= threshold) blank++;
  }
  return blank / width >= minRatio;
}

/**
 * Find solid white (or transparent) bands at the top and bottom of a PNG.
 * `pixelRatio` converts bitmap rows to CSS pixels used in the HTML email.
 */
export async function detectWhiteVerticalMargins(
  dataUrl: string,
  cssWidth: number,
  cssHeight: number,
  pixelRatio = 2,
): Promise<WhiteMarginCrop | null> {
  const img = await loadImage(dataUrl);
  const bw = img.naturalWidth || img.width;
  const bh = img.naturalHeight || img.height;
  if (bw < 8 || bh < 8) return null;

  const canvas = document.createElement("canvas");
  canvas.width = bw;
  canvas.height = bh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, bw, bh);

  const threshold = 248;
  const minRatio = 0.982;
  const pr = Math.max(1, pixelRatio);

  let topPx = 0;
  while (
    topPx < bh - 1 &&
    rowIsBlank(data, bw, topPx, threshold, minRatio)
  ) {
    topPx++;
  }

  let bottomPx = 0;
  while (
    bottomPx < bh - 1 - topPx &&
    rowIsBlank(data, bw, bh - 1 - bottomPx, threshold, minRatio)
  ) {
    bottomPx++;
  }

  // Ignore tiny anti-alias fringes; require a meaningful trim.
  const minTrimBitmap = Math.max(4, Math.round(2 * pr));
  if (topPx + bottomPx < minTrimBitmap) return null;

  const top = Math.round(topPx / pr);
  const bottom = Math.round(bottomPx / pr);
  const width = Math.round(cssWidth);
  const height = Math.max(
    80,
    Math.round(cssHeight) - top - bottom,
  );

  // Refuse to crop away most of the design.
  if (height < Math.round(cssHeight) * 0.35) return null;
  if (top === 0 && bottom === 0) return null;

  return { top, bottom, height, width };
}

/** Crop a PNG data URL by CSS-pixel margins (scaled by pixelRatio). */
export async function cropPngDataUrl(
  dataUrl: string,
  crop: WhiteMarginCrop,
  pixelRatio = 2,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const pr = Math.max(1, pixelRatio);
  const sx = 0;
  const sy = Math.round(crop.top * pr);
  const sw = img.naturalWidth || img.width;
  const sh = Math.max(
    1,
    (img.naturalHeight || img.height) -
      Math.round(crop.top * pr) -
      Math.round(crop.bottom * pr),
  );

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not crop email snapshot.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sw, sh);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: crop.width,
    height: crop.height,
  };
}

/**
 * Wrap Canva HTML so white letterboxing above/below is clipped.
 * Works in browser preview and most webmail; Outlook paste still uses the cropped PNG.
 */
export function applyHtmlVerticalCrop(
  html: string,
  crop: WhiteMarginCrop,
): string {
  const top = Math.max(0, Math.round(crop.top));
  const bottom = Math.max(0, Math.round(crop.bottom));
  if (top === 0 && bottom === 0) return html;

  const w = Math.round(crop.width);
  const h = Math.round(crop.height);
  const body = extractEmailBodyHtml(html);
  const wrapped = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${w}" style="border-collapse:collapse;width:${w}px;max-width:${w}px;margin:0 auto;mso-table-lspace:0pt;mso-table-rspace:0pt;">
<tr>
<td height="${h}" valign="top" style="padding:0;margin:0;height:${h}px;max-height:${h}px;overflow:hidden;vertical-align:top;background:#ffffff;">
<div style="margin:0;padding:0;margin-top:-${top}px;${bottom > 0 ? `margin-bottom:-${bottom}px;` : ""}">
${body}
</div>
</td>
</tr>
</table>`;

  if (!isFullHtmlDocument(html)) {
    return wrapped;
  }

  const head = extractEmailHeadInner(html);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=${w}"/>
${head}
</head>
<body style="margin:0;padding:0;background:#ffffff;">
${wrapped}
</body>
</html>`;
}

export async function dataUrlToPngFile(
  dataUrl: string,
  fileName = "canva-preview.png",
): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], fileName, { type: "image/png" });
}
