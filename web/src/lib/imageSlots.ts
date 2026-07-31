/** Replaceable image slots detected from Canva / email HTML. */

export type ImageSlotMode = "fixed" | "shared" | "perRecipient";

export type ImageSlotDef = {
  /** Stable id (injected as data-grat-slot on <img>). */
  id: string;
  /** Owner label shown on Compose. */
  label: string;
  mode: ImageSlotMode;
  /** Src as stored in compiled HTML (used as fallback match). */
  originalSrc: string;
  designedWidth: number;
  designedHeight: number;
  /** Corner radius from Canva/HTML style (px). Applied on replacements. */
  borderRadius: number;
};

export const IMAGE_SLOT_MODES: Array<{
  value: ImageSlotMode;
  label: string;
  hint: string;
}> = [
  {
    value: "fixed",
    label: "Fixed (no change)",
    hint: "Keep the template image; Compose cannot replace it",
  },
  {
    value: "shared",
    label: "Shared (all recipients)",
    hint: "Composer uploads one replacement for everyone",
  },
  {
    value: "perRecipient",
    label: "Per person",
    hint: "Composer uploads a different image for each recipient",
  },
];

export function imageSlotModeLabel(mode: ImageSlotMode): string {
  return IMAGE_SLOT_MODES.find((m) => m.value === mode)?.label ?? mode;
}

export function isImageSlotMode(v: unknown): v is ImageSlotMode {
  return (
    typeof v === "string" && IMAGE_SLOT_MODES.some((m) => m.value === v)
  );
}

const IMG_TAG_RE = /<img\b([^>]*?)>/gi;

function attr(attrs: string, name: string): string | null {
  const re = new RegExp(
    `\\b${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const m = re.exec(attrs);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3] ?? "").trim() || null;
}

function stylePx(style: string | null, prop: string): number | null {
  if (!style) return null;
  const re = new RegExp(`${prop}\\s*:\\s*([\\d.]+)px`, "i");
  const m = re.exec(style);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** First border-radius length in px (handles `12px` or `12px 12px …`). */
export function parseBorderRadiusPx(style: string | null): number {
  if (!style) return 0;
  const m = /border-radius\s*:\s*([0-9.]+)px/i.exec(style);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Cap radius so replacements stay subtle like typical Canva email corners. */
export function clampSlotBorderRadius(
  radius: number,
  designedWidth: number,
  designedHeight: number,
): number {
  if (!Number.isFinite(radius) || radius <= 0) return 0;
  const minSide = Math.max(1, Math.min(designedWidth, designedHeight));
  // ~4% of the short side, hard-capped — avoids pill/capsule corners.
  const cap = Math.min(12, Math.max(4, Math.round(minSide * 0.04)));
  return Math.min(Math.round(radius), cap);
}

function parseSize(attrs: string): { width: number; height: number } {
  const style = attr(attrs, "style");
  const wAttr = Number(attr(attrs, "width") ?? "");
  const hAttr = Number(attr(attrs, "height") ?? "");
  const wStyle = stylePx(style, "width");
  const hStyle = stylePx(style, "height");
  const maxW = stylePx(style, "max-width");

  let width =
    (Number.isFinite(wAttr) && wAttr > 0 ? Math.round(wAttr) : null) ??
    wStyle ??
    maxW ??
    0;
  let height =
    (Number.isFinite(hAttr) && hAttr > 0 ? Math.round(hAttr) : null) ??
    hStyle ??
    0;

  // Skip tracking pixels / icons
  if (width > 0 && height > 0 && width <= 8 && height <= 8) {
    return { width: 0, height: 0 };
  }

  if (width <= 0 && height <= 0) {
    width = 600;
    height = 400;
  } else if (width <= 0) {
    width = Math.round(height * 1.5);
  } else if (height <= 0) {
    height = Math.round(width * 0.66);
  }

  width = Math.min(1600, Math.max(40, width));
  height = Math.min(2400, Math.max(40, height));
  return { width, height };
}

function basenameHint(src: string): string {
  try {
    const path = src.split("?")[0] ?? src;
    const base = path.replace(/\\/g, "/").split("/").pop() ?? "image";
    const name = base.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
    if (!name || /^[0-9a-f-]{8,}$/i.test(name)) return "Image";
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return "Image";
  }
}

function slotIdFromSrc(src: string, index: number): string {
  const path = src.split("?")[0] ?? src;
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "";
  const clean = base
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 40);
  if (clean.length >= 4) return `img-${clean}`;
  return `img-${index}`;
}

export type DetectedImg = {
  fullTag: string;
  attrs: string;
  src: string;
  width: number;
  height: number;
  borderRadius: number;
  existingSlotId: string | null;
};

/** Content images in HTML (skips tiny trackers). */
export function detectImgTags(html: string): DetectedImg[] {
  const out: DetectedImg[] = [];
  const re = new RegExp(IMG_TAG_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] ?? "";
    const src = attr(attrs, "src");
    if (!src) continue;
    if (/^(data:|cid:)/i.test(src)) continue;
    const { width, height } = parseSize(attrs);
    if (width <= 0 || height <= 0) continue;
    // Only trust border-radius on the <img> itself — parent/card radii are
    // often much larger and were making replacements look over-rounded.
    const borderRadius = clampSlotBorderRadius(
      parseBorderRadiusPx(attr(attrs, "style")),
      width,
      height,
    );
    out.push({
      fullTag: m[0],
      attrs,
      src,
      width,
      height,
      borderRadius,
      existingSlotId: attr(attrs, "data-grat-slot"),
    });
  }
  return out;
}

export function parseImageSlotsFromDesignJson(
  designJson: Record<string, unknown> | null | undefined,
): ImageSlotDef[] {
  const raw = designJson?.imageSlots;
  if (!Array.isArray(raw)) return [];
  const out: ImageSlotDef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id || seen.has(id)) continue;
    if (!isImageSlotMode(row.mode)) continue;
    const originalSrc =
      typeof row.originalSrc === "string" ? row.originalSrc : "";
    const designedWidth =
      typeof row.designedWidth === "number" && row.designedWidth > 0
        ? Math.round(row.designedWidth)
        : 600;
    const designedHeight =
      typeof row.designedHeight === "number" && row.designedHeight > 0
        ? Math.round(row.designedHeight)
        : 400;
    const borderRadius = clampSlotBorderRadius(
      typeof row.borderRadius === "number" && row.borderRadius > 0
        ? Math.round(row.borderRadius)
        : 0,
      designedWidth,
      designedHeight,
    );
    const label =
      typeof row.label === "string" && row.label.trim()
        ? row.label.trim()
        : basenameHint(originalSrc || id);
    seen.add(id);
    out.push({
      id,
      label,
      mode: row.mode,
      originalSrc,
      designedWidth,
      designedHeight,
      borderRadius,
    });
  }
  return out;
}

/** Clamp an existing border-radius in the img style (fixes prior over-injection). */
function normalizeImgBorderRadiusStyle(
  attrs: string,
  designedWidth: number,
  designedHeight: number,
): string {
  const style = attr(attrs, "style");
  if (!style || !/border-radius\s*:/i.test(style)) return attrs;
  const current = parseBorderRadiusPx(style);
  const next = clampSlotBorderRadius(current, designedWidth, designedHeight);
  if (current <= 0) return attrs;
  if (current === next) return attrs;
  const newStyle = style.replace(
    /border-radius\s*:\s*[^;]+;?/i,
    next > 0 ? `border-radius: ${next}px;` : "",
  );
  return attrs.replace(
    /\bstyle\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)/i,
    `style="${newStyle.replace(/\s*;\s*;/g, ";").trim()}"`,
  );
}

/**
 * Sync slots from HTML; keep owner labels/modes for matching ids/srcs.
 * Returns updated slots + HTML with data-grat-slot attributes.
 */
export function syncImageSlotsWithHtml(
  html: string,
  previous: ImageSlotDef[] = [],
): { slots: ImageSlotDef[]; html: string } {
  const prevById = new Map(previous.map((s) => [s.id, s] as const));
  const prevBySrc = new Map(
    previous.map((s) => [s.originalSrc, s] as const),
  );
  const detected = detectImgTags(html);
  const usedIds = new Set<string>();
  const slots: ImageSlotDef[] = [];

  for (let i = 0; i < detected.length; i++) {
    const img = detected[i];
    const prev =
      (img.existingSlotId ? prevById.get(img.existingSlotId) : undefined) ??
      prevBySrc.get(img.src);

    let id = prev?.id ?? img.existingSlotId ?? slotIdFromSrc(img.src, i);
    if (usedIds.has(id)) id = `${id}-${i}`;
    usedIds.add(id);

    slots.push({
      id,
      label: prev?.label?.trim() || basenameHint(img.src),
      mode: prev?.mode ?? "fixed",
      originalSrc: img.src,
      designedWidth: prev?.designedWidth || img.width,
      designedHeight: prev?.designedHeight || img.height,
      borderRadius:
        prev?.borderRadius && prev.borderRadius > 0
          ? prev.borderRadius
          : img.borderRadius,
    });
  }

  let slotIndex = 0;
  const nextHtml = html.replace(IMG_TAG_RE, (full, attrs: string) => {
    const src = attr(attrs, "src");
    if (!src || /^(data:|cid:)/i.test(src)) return full;
    const { width, height } = parseSize(attrs);
    if (width <= 0 || height <= 0) return full;
    const slot = slots[slotIndex++];
    if (!slot) return full;
    let nextAttrs = attrs;
    if (/\bdata-grat-slot\s*=/i.test(nextAttrs)) {
      nextAttrs = nextAttrs.replace(
        /\bdata-grat-slot\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)/i,
        `data-grat-slot="${slot.id}"`,
      );
    } else {
      nextAttrs = `${nextAttrs} data-grat-slot="${slot.id}"`;
    }
    if (!/\bwidth\s*=/i.test(nextAttrs)) {
      nextAttrs += ` width="${slot.designedWidth}"`;
    }
    if (!/\bheight\s*=/i.test(nextAttrs)) {
      nextAttrs += ` height="${slot.designedHeight}"`;
    }
    nextAttrs = normalizeImgBorderRadiusStyle(
      nextAttrs,
      slot.designedWidth,
      slot.designedHeight,
    );
    return `<img${nextAttrs}>`;
  });

  return { slots, html: nextHtml };
}

/** Clamp any over-large border-radius styles left on slot images. */
export function normalizeImageSlotRadiiInHtml(
  html: string,
  slots: ImageSlotDef[] = [],
): string {
  const byId = new Map(slots.map((s) => [s.id, s] as const));
  return html.replace(IMG_TAG_RE, (full, attrs: string) => {
    const src = attr(attrs, "src");
    if (!src || /^(data:|cid:)/i.test(src)) return full;
    const slotId = attr(attrs, "data-grat-slot");
    const slot = slotId ? byId.get(slotId) : undefined;
    const size = parseSize(attrs);
    if (size.width <= 0 || size.height <= 0) return full;
    const nextAttrs = normalizeImgBorderRadiusStyle(
      attrs,
      slot?.designedWidth || size.width,
      slot?.designedHeight || size.height,
    );
    return nextAttrs === attrs ? full : `<img${nextAttrs}>`;
  });
}

/** Replace src on imgs matching data-grat-slot (or originalSrc fallback). */
export function applyImageSlotOverrides(
  html: string,
  overrides: Record<string, string>,
  slots: ImageSlotDef[] = [],
): string {
  const map = new Map(
    Object.entries(overrides)
      .filter(([, url]) => Boolean(url?.trim()))
      .map(([k, url]) => [k, url.trim()] as const),
  );
  if (map.size === 0) return html;

  const slotsById = new Map(slots.map((s) => [s.id, s] as const));
  const byOriginal = new Map(
    slots
      .filter((s) => map.has(s.id))
      .map((s) => [s.originalSrc, map.get(s.id)!] as const),
  );

  return html.replace(IMG_TAG_RE, (full, attrs: string) => {
    const slotId = attr(attrs, "data-grat-slot");
    const src = attr(attrs, "src") ?? "";
    const nextUrl =
      (slotId && map.get(slotId)) ||
      (src ? byOriginal.get(src) : undefined);
    if (!nextUrl) return full;

    const slot =
      (slotId ? slotsById.get(slotId) : undefined) ??
      slots.find((s) => s.originalSrc === src);

    let nextAttrs = attrs;
    if (/\bsrc\s*=/i.test(nextAttrs)) {
      nextAttrs = nextAttrs.replace(
        /\bsrc\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)/i,
        `src="${nextUrl}"`,
      );
    } else {
      nextAttrs = ` src="${nextUrl}"${nextAttrs}`;
    }
    nextAttrs = normalizeImgBorderRadiusStyle(
      nextAttrs,
      slot?.designedWidth ?? 600,
      slot?.designedHeight ?? 400,
    );
    return `<img${nextAttrs}>`;
  });
}

/**
 * Cover-crop resize to designed slot size.
 * When borderRadius > 0, clips corners and returns a transparent PNG.
 */
export async function resizeImageFileToSlot(
  file: File,
  designedWidth: number,
  designedHeight: number,
  opts?: {
    fileName?: string;
    mime?: "image/jpeg" | "image/png";
    quality?: number;
    borderRadius?: number;
  },
): Promise<File> {
  const w = Math.max(40, Math.round(designedWidth));
  const h = Math.max(40, Math.round(designedHeight));
  const radius = clampSlotBorderRadius(
    opts?.borderRadius ?? 0,
    w,
    h,
  );
  const mime = opts?.mime ?? (radius > 0 ? "image/png" : "image/jpeg");
  const quality = opts?.quality ?? 0.9;

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare image canvas.");

    const scale = Math.max(w / bitmap.width, h / bitmap.height);
    const dw = bitmap.width * scale;
    const dh = bitmap.height * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    ctx.clearRect(0, 0, w, h);
    if (radius > 0) {
      roundedRectPath(ctx, 0, 0, w, h, radius);
      ctx.clip();
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap, dx, dy, dw, dh);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image encode failed"))),
        mime,
        quality,
      );
    });

    const base =
      opts?.fileName?.replace(/\.[a-z0-9]+$/i, "") ||
      file.name.replace(/\.[a-z0-9]+$/i, "") ||
      "slot";
    const ext = mime === "image/png" ? "png" : "jpg";
    return new File([blob], `${base}-${w}x${h}.${ext}`, { type: mime });
  } finally {
    bitmap.close();
  }
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Infer rounded corners from transparent pixels in the template image
 * (Canva often bakes radius into the PNG instead of CSS).
 */
export async function inferBorderRadiusFromImageUrl(
  url: string,
  designedWidth: number,
  designedHeight: number,
): Promise<number> {
  if (!url || /^(cid:)/i.test(url)) return 0;
  try {
    const img = await loadImageElement(url);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w < 16 || h < 16) return 0;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;

    const alpha = (x: number, y: number) => {
      const xi = Math.min(w - 1, Math.max(0, Math.floor(x)));
      const yi = Math.min(h - 1, Math.max(0, Math.floor(y)));
      return data[(yi * w + xi) * 4 + 3] ?? 255;
    };
    const isClear = (x: number, y: number) => alpha(x, y) < 28;

    // No transparent corner → no baked radius.
    if (!isClear(0, 0) && !isClear(1, 0) && !isClear(0, 1)) return 0;

    // Walk inward along the top and left edges until content appears.
    const maxProbe = Math.floor(Math.min(w, h) * 0.2);
    let alongTop = 0;
    while (alongTop < maxProbe && isClear(alongTop, 0)) alongTop += 1;
    let alongLeft = 0;
    while (alongLeft < maxProbe && isClear(0, alongLeft)) alongLeft += 1;

    // Rounded-rect clear spans on both edges should be similar.
    const natural = Math.round((alongTop + alongLeft) / 2);
    if (natural < 3) return 0;

    const scale = designedWidth > 0 ? designedWidth / w : 1;
    void designedHeight;
    return clampSlotBorderRadius(natural * scale, designedWidth, designedHeight);
  } catch {
    return 0;
  }
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load template image"));
    img.src = url;
  });
}

/** Resolve CSS radius, or infer from the original Canva PNG alpha. */
export async function resolveSlotBorderRadius(
  slot: ImageSlotDef,
): Promise<number> {
  const fromCss = clampSlotBorderRadius(
    slot.borderRadius,
    slot.designedWidth,
    slot.designedHeight,
  );
  if (fromCss > 0) return fromCss;
  if (!slot.originalSrc) return 0;
  return inferBorderRadiusFromImageUrl(
    slot.originalSrc,
    slot.designedWidth,
    slot.designedHeight,
  );
}

export function replaceableImageSlots(slots: ImageSlotDef[]): ImageSlotDef[] {
  return slots.filter((s) => s.mode === "shared" || s.mode === "perRecipient");
}

export function sharedImageSlots(slots: ImageSlotDef[]): ImageSlotDef[] {
  return slots.filter((s) => s.mode === "shared");
}

export function perRecipientImageSlots(slots: ImageSlotDef[]): ImageSlotDef[] {
  return slots.filter((s) => s.mode === "perRecipient");
}
