import type { Canvas, FabricObject, FabricImage, Textbox } from "fabric";
import { absoluteUploadUrl, DESIGN_HEIGHT, DESIGN_WIDTH } from "./compile";

type Frame = {
  radius: number;
  borderWidth: number;
  borderColor: string;
};

type Bounds = {
  obj: FabricObject;
  type: string;
  left: number;
  top: number;
  w: number;
  h: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
  scaleX: number;
  scaleY: number;
};

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Always emit #rrggbb — Outlook paste drops rgb()/named colors and falls back to black. */
function toHexColor(value: unknown, fallback = "#1c2420"): string {
  if (value && typeof value === "object") {
    const obj = value as { toHex?: () => string; hex?: string };
    if (typeof obj.toHex === "function") {
      try {
        const h = obj.toHex();
        if (h) return toHexColor(h.startsWith("#") ? h : `#${h}`, fallback);
      } catch {
        /* ignore */
      }
    }
    if (typeof obj.hex === "string" && obj.hex.trim()) {
      return toHexColor(
        obj.hex.startsWith("#") ? obj.hex : `#${obj.hex}`,
        fallback,
      );
    }
  }
  if (typeof value !== "string" || !value.trim()) return fallback;
  const s = value.trim().toLowerCase();
  if (s === "transparent" || s === "none") return fallback;
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{8}$/.test(s)) return s.slice(0, 7);
  if (/^#[0-9a-f]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s);
  if (rgb) {
    const hex = (n: string) =>
      Math.max(0, Math.min(255, Math.round(Number(n))))
        .toString(16)
        .padStart(2, "0");
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }
  if (typeof document !== "undefined") {
    try {
      const el = document.createElement("div");
      el.style.color = s;
      document.body.appendChild(el);
      const computed = getComputedStyle(el).color;
      document.body.removeChild(el);
      if (computed && computed !== s) {
        const again = toHexColor(computed, "");
        if (again) return again;
      }
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

function colorCss(value: unknown, fallback = "transparent") {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t || /^transparent|none$/i.test(t)) return fallback;
  }
  if (fallback === "transparent") {
    const hex = toHexColor(value, "");
    return hex || "transparent";
  }
  return toHexColor(value, fallback);
}

/** Word/Outlook paste keeps <font color> far more reliably than CSS color alone. */
function outlookColoredHtml(
  content: string,
  color: string,
  face: string,
  extraStyle = "",
) {
  const hex = toHexColor(color, "#1c2420");
  const style = styleJoin([`color:${hex}`, extraStyle || null]);
  return `<font color="${esc(hex)}" face="${esc(face)}" style="${style}">${content}</font>`;
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function px(value: number) {
  return Math.round(value);
}

function pct(part: number, whole: number) {
  if (whole <= 0) return 100;
  return Math.max(1, Math.min(100, Math.round((part / whole) * 100)));
}

function styleJoin(parts: Array<string | null | false | undefined>) {
  return parts.filter(Boolean).join(";");
}

/** Horizontal padding on each email section cell — matches typical designer inset. */
const SECTION_GUTTER = 24;

function contentWidth(stageW: number) {
  return Math.max(1, stageW - SECTION_GUTTER * 2);
}

/**
 * Width inside a section cell (already guttered). Near-edge CTAs must be 100%,
 * not "92% of stage" which double-insets inside the padded cell.
 */
function blockWidthInSection(shapeW: number, stageW: number) {
  const cw = contentWidth(stageW);
  if (shapeW >= cw * 0.9) {
    return { widthPct: 100, widthPx: cw, fullBleed: true as const };
  }
  return {
    widthPct: Math.max(30, pct(shapeW, cw)),
    widthPx: Math.min(cw, px(shapeW)),
    fullBleed: false as const,
  };
}

function scaledSize(obj: FabricObject) {
  const scaleX = num(obj.scaleX, 1);
  const scaleY = num(obj.scaleY, 1);
  const w =
    typeof obj.getScaledWidth === "function"
      ? obj.getScaledWidth()
      : Math.max(1, num(obj.width) * scaleX);
  const h =
    typeof obj.getScaledHeight === "function"
      ? obj.getScaledHeight()
      : Math.max(1, num(obj.height) * scaleY);
  return { w: Math.max(1, w), h: Math.max(1, h), scaleX, scaleY };
}

function cssTopLeft(obj: FabricObject, w: number, h: number) {
  let left = num(obj.left);
  let top = num(obj.top);
  const ox = obj.originX ?? "left";
  const oy = obj.originY ?? "top";
  if (ox === "center") left -= w / 2;
  else if (ox === "right") left -= w;
  if (oy === "center") top -= h / 2;
  else if (oy === "bottom") top -= h;
  return { left, top };
}

/**
 * Visual box as Fabric paints it (same coords the PNG raster uses).
 * Prefer getBoundingRect over width*scaleX — after resize/scale those diverge
 * from what you see on the canvas.
 */
function boundsOf(obj: FabricObject): Bounds | null {
  const type = (obj.type ?? "").toLowerCase();
  if (!type || type === "activeselection" || type === "group") return null;

  const { scaleX, scaleY } = scaledSize(obj);

  try {
    if (typeof obj.setCoords === "function") obj.setCoords();
    const br = (
      obj as FabricObject & {
        getBoundingRect: (
          absolute?: boolean,
          calculate?: boolean,
        ) => { left: number; top: number; width: number; height: number };
      }
    ).getBoundingRect(true, true);
    if (
      br &&
      Number.isFinite(br.left) &&
      Number.isFinite(br.top) &&
      Number.isFinite(br.width) &&
      Number.isFinite(br.height) &&
      br.width > 0 &&
      br.height > 0
    ) {
      const left = br.left;
      const top = br.top;
      const bw = Math.max(1, br.width);
      const bh = Math.max(1, br.height);
      return {
        obj,
        type,
        left,
        top,
        w: bw,
        h: bh,
        right: left + bw,
        bottom: top + bh,
        cx: left + bw / 2,
        cy: top + bh / 2,
        scaleX,
        scaleY,
      };
    }
  } catch {
    /* fall through */
  }

  // Fallback when getBoundingRect is unavailable
  const { w, h } = scaledSize(obj);
  let left: number;
  let top: number;
  let bw = w;
  let bh = h;

  if (type === "circle") {
    const radius =
      num((obj as FabricObject & { radius?: number }).radius) * scaleX;
    bw = bh = Math.max(1, radius * 2);
    ({ left, top } = cssTopLeft(obj, bw, bh));
  } else if (type === "ellipse") {
    const rx = num((obj as FabricObject & { rx?: number }).rx) * scaleX;
    const ry = num((obj as FabricObject & { ry?: number }).ry) * scaleY;
    bw = Math.max(1, rx * 2);
    bh = Math.max(1, ry * 2);
    ({ left, top } = cssTopLeft(obj, bw, bh));
  } else if (type === "textbox" || type === "i-text" || type === "text") {
    const text = obj as Textbox;
    bw = Math.max(1, num(text.width) * scaleX);
    bh = Math.max(
      num(text.fontSize, 16) * scaleY,
      typeof obj.getScaledHeight === "function" ? obj.getScaledHeight() : bh,
    );
    ({ left, top } = cssTopLeft(obj, bw, bh));
  } else {
    ({ left, top } = cssTopLeft(obj, bw, bh));
  }

  return {
    obj,
    type,
    left,
    top,
    w: bw,
    h: bh,
    right: left + bw,
    bottom: top + bh,
    cx: left + bw / 2,
    cy: top + bh / 2,
    scaleX,
    scaleY,
  };
}

function resolveImageSrc(src: string) {
  if (!src) return "";
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  const key = src.replace(/^\/+uploads\/+/i, "").replace(/^\/+/, "");
  if (key.includes("/") || /\.(jpe?g|png|gif|webp)$/i.test(key)) {
    return absoluteUploadUrl(key);
  }
  return src;
}

function isText(type: string) {
  return type === "textbox" || type === "i-text" || type === "text";
}

function isShape(type: string) {
  return type === "rect" || type === "circle" || type === "ellipse";
}

function isImage(type: string) {
  return type === "image";
}

function isFullBleed(b: Bounds, stageW: number) {
  return b.w >= stageW * 0.82 && b.left <= stageW * 0.1;
}

/**
 * True edge-to-edge header/footer/background strips (flush to both sides).
 * Inset CTAs (e.g. left:24, width:552 on a 600 canvas) must NOT match.
 */
function isSectionBand(b: Bounds, stageW: number) {
  if (!isShape(b.type)) return false;
  if (b.type === "circle" || b.type === "ellipse") return false;
  if (shapeFill(b) === "transparent") return false;
  const leftOk = b.left <= 8;
  const rightOk = stageW - b.right <= 8;
  const wideOk = b.w >= stageW * 0.96;
  return wideOk && leftOk && rightOk;
}

function overlaps(a: Bounds, b: Bounds, pad = 4) {
  return !(
    a.right < b.left - pad ||
    a.left > b.right + pad ||
    a.bottom < b.top - pad ||
    a.top > b.bottom + pad
  );
}

/** Prefer the long rect/bar under the label; never let a circle steal the CTA. */
function pickButtonShape(
  candidates: Bounds[],
  label: Bounds,
  stageW: number,
): Bounds | null {
  const overlapping = candidates.filter(
    (s) =>
      isShape(s.type) &&
      overlaps(s, label, 12) &&
      !isSectionBand(s, stageW),
  );
  if (!overlapping.length) return null;
  const rects = overlapping.filter((s) => s.type === "rect");
  const nonCircles = overlapping.filter(
    (s) => s.type !== "circle" && s.type !== "ellipse",
  );
  const pool = rects.length ? rects : nonCircles.length ? nonCircles : overlapping;
  return [...pool].sort((a, b) => b.w - a.w || b.h - a.h)[0];
}

function textAlignOf(obj: FabricObject, _box: Bounds, _stageW: number) {
  const text = obj as Textbox;
  const alignRaw =
    typeof text.textAlign === "string" ? text.textAlign.toLowerCase() : "left";
  // Respect the designer setting — do not auto-force center for wide boxes.
  if (alignRaw === "center" || alignRaw === "right" || alignRaw === "justify") {
    return alignRaw as "left" | "center" | "right" | "justify";
  }
  return "left";
}

function renderTextHtml(box: Bounds, stageW: number) {
  const text = box.obj as Textbox;
  const fontSize = Math.max(1, num(text.fontSize, 16) * box.scaleY);
  const fill = colorCss(text.fill, "#1c2420");
  const fontFamily =
    typeof text.fontFamily === "string"
      ? text.fontFamily
      : "Segoe UI, Arial, sans-serif";
  const fontWeight = text.fontWeight != null ? String(text.fontWeight) : "normal";
  const fontStyle = text.fontStyle === "italic" ? "italic" : "normal";
  const underline = Boolean(text.underline);
  const align = textAlignOf(box.obj, box, stageW);
  const content = esc(String(text.text ?? "")).replace(/\r\n|\r|\n/g, "<br/>");
  const lineHeight =
    typeof text.lineHeight === "number" && text.lineHeight > 0
      ? Math.round(text.lineHeight * 100) / 100
      : 1.35;

  // Word/Outlook: keep hex colors + <font color> (CSS-only color is stripped on paste).
  const fontCss = styleJoin([
    `font-size:${px(fontSize)}px`,
    `line-height:${Math.round(fontSize * lineHeight)}px`,
    `color:${fill}`,
    `font-family:${esc(fontFamily)}`,
    `font-weight:${esc(fontWeight)}`,
    `font-style:${fontStyle}`,
    underline ? "text-decoration:underline" : null,
  ]);
  const inner = outlookColoredHtml(
    content,
    fill,
    fontFamily,
    styleJoin([
      `font-size:${px(fontSize)}px`,
      `line-height:${Math.round(fontSize * lineHeight)}px`,
      `font-weight:${esc(fontWeight)}`,
      `font-style:${fontStyle}`,
      underline ? "text-decoration:underline" : null,
    ]),
  );

  return {
    html: `<div style="${styleJoin([
      fontCss,
      `text-align:${align}`,
      "word-break:break-word",
      "mso-line-height-rule:exactly",
      // Keep short / inset text near its canvas X (avoids everything looking left-stuck)
      box.w < stageW * 0.85 && box.left > SECTION_GUTTER + 4
        ? `margin-left:${Math.max(0, px(box.left - SECTION_GUTTER))}px;max-width:${px(box.w)}px`
        : null,
    ])}"><span style="${fontCss}">${inner}</span></div>`,
    align,
    color: fill,
    fontSize,
    fontFamily,
    fontWeight,
  };
}

function renderImageHtml(box: Bounds, stageW: number) {
  const image = box.obj as FabricImage;
  const rawSrc =
    typeof image.getSrc === "function"
      ? image.getSrc()
      : typeof (image as FabricImage & { src?: string }).src === "string"
        ? (image as FabricImage & { src?: string }).src!
        : "";
  const src = resolveImageSrc(rawSrc);
  if (!src) return "";
  const w = px(box.w);
  // Prefer canvas X inside the section gutter so right-side images stay right.
  const offset = Math.max(0, px(box.left - SECTION_GUTTER));
  const contentW = contentWidth(stageW);
  const nearRight = stageW - box.right <= SECTION_GUTTER + 8;
  const nearLeft = box.left <= SECTION_GUTTER + 8;
  const centered = Math.abs(box.cx - stageW / 2) <= 24;
  // Cancel the section gutter when the canvas image touches a side wall.
  const rightBleed = Math.max(0, px(box.right - (stageW - SECTION_GUTTER)));
  const leftBleed = Math.max(0, px(SECTION_GUTTER - box.left));

  const img = `<img src="${esc(src)}" alt="" width="${w}" style="display:block;border:0;outline:none;width:${w}px;max-width:100%;height:auto;" />`;

  if (centered) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr><td style="padding:0;font-size:0;line-height:0;">${img}</td></tr></table>`;
  }
  if (nearRight || (!nearLeft && offset > contentW * 0.35)) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" width="${w}" style="border-collapse:collapse;margin:0 -${rightBleed}px 0 auto;width:${w}px;max-width:100%;"><tr><td style="padding:0;font-size:0;line-height:0;">${img}</td></tr></table>`;
  }
  if (nearLeft && leftBleed > 0) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left" width="${w}" style="border-collapse:collapse;margin:0 auto 0 -${leftBleed}px;width:${w}px;max-width:100%;"><tr><td style="padding:0;font-size:0;line-height:0;">${img}</td></tr></table>`;
  }
  if (offset > 0) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${w}" style="border-collapse:collapse;margin:0 0 0 ${offset}px;width:${w}px;max-width:100%;"><tr><td style="padding:0;font-size:0;line-height:0;">${img}</td></tr></table>`;
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left" width="${w}" style="border-collapse:collapse;margin:0;width:${w}px;max-width:100%;"><tr><td style="padding:0;font-size:0;line-height:0;">${img}</td></tr></table>`;
}

function renderCircleHtml(box: Bounds, fill: string) {
  // Fill the positioned parent (parent width is % of card) so circles scale
  // with the card instead of keeping a fixed px size that drifts.
  void box;
  return `<div class="grat-email-circle" style="display:block;width:100%;aspect-ratio:1/1;height:auto;max-width:100%;background:${esc(fill)};border-radius:50%;font-size:1px;line-height:0;mso-line-height-rule:exactly;">&nbsp;</div>`;
}

/**
 * Prefer small circles that actually sit on the CTA bar. Large decorative
 * circles that only graze the bar must stay free-floating (beside "asd" etc.).
 */
function findButtonAccents(
  shape: Bounds,
  label: Bounds,
  candidates: Bounds[],
  used: Set<Bounds>,
) {
  const hits = candidates.filter((b) => {
    if (used.has(b) || b === shape || b === label) return false;
    if (b.type !== "circle" && b.type !== "ellipse") return false;
    if (shapeFill(b) === "transparent") return false;
    if (!(overlaps(shape, b, 16) || overlaps(label, b, 16))) return false;
    // Accent should be smaller than the bar and overlap its vertical span.
    if (b.w > shape.w * 0.55 || b.h > shape.h * 2.5) return false;
    if (b.cy < shape.top - b.h * 0.35 || b.cy > shape.bottom + b.h * 0.35) {
      return false;
    }
    return true;
  });
  return hits.sort((a, b) => a.w * a.h - b.w * b.h);
}

/** Plain text markup without canvas-X margin (used inside absolute stages). */
function renderTextContentHtml(box: Bounds, stageW: number) {
  const text = box.obj as Textbox;
  const fontSize = Math.max(1, num(text.fontSize, 16) * box.scaleY);
  const fill = colorCss(text.fill, "#1c2420");
  const fontFamily =
    typeof text.fontFamily === "string"
      ? text.fontFamily
      : "Segoe UI, Arial, sans-serif";
  const fontWeight = text.fontWeight != null ? String(text.fontWeight) : "normal";
  const fontStyle = text.fontStyle === "italic" ? "italic" : "normal";
  const underline = Boolean(text.underline);
  const align = textAlignOf(box.obj, box, stageW);
  const content = esc(String(text.text ?? "")).replace(/\r\n|\r|\n/g, "<br/>");
  const lineHeight =
    typeof text.lineHeight === "number" && text.lineHeight > 0
      ? Math.round(text.lineHeight * 100) / 100
      : 1.35;
  const fontCss = styleJoin([
    `font-size:${px(fontSize)}px`,
    `line-height:${Math.round(fontSize * lineHeight)}px`,
    `color:${fill}`,
    `font-family:${esc(fontFamily)}`,
    `font-weight:${esc(fontWeight)}`,
    `font-style:${fontStyle}`,
    underline ? "text-decoration:underline" : null,
  ]);
  const inner = outlookColoredHtml(
    content,
    fill,
    fontFamily,
    styleJoin([
      `font-size:${px(fontSize)}px`,
      `line-height:${Math.round(fontSize * lineHeight)}px`,
      `font-weight:${esc(fontWeight)}`,
      `font-style:${fontStyle}`,
      underline ? "text-decoration:underline" : null,
    ]),
  );
  return {
    html: `<div style="${styleJoin([
      fontCss,
      `text-align:${align}`,
      "word-break:break-word",
      "mso-line-height-rule:exactly",
    ])}"><span style="${fontCss}">${inner}</span></div>`,
    align,
    color: fill,
    fontSize,
    fontFamily,
    fontWeight,
  };
}

function renderPositionedChildHtml(box: Bounds, stageW: number): string {
  if (isText(box.type)) return renderTextContentHtml(box, stageW).html;
  if (isImage(box.type)) {
    const image = box.obj as FabricImage;
    const rawSrc =
      typeof image.getSrc === "function"
        ? image.getSrc()
        : typeof (image as FabricImage & { src?: string }).src === "string"
          ? (image as FabricImage & { src?: string }).src!
          : "";
    const src = resolveImageSrc(rawSrc);
    if (!src) return "";
    return `<img src="${esc(src)}" alt="" style="display:block;border:0;outline:none;width:100%;height:auto;" />`;
  }
  if (box.type === "circle" || box.type === "ellipse") {
    const fill = shapeFill(box);
    if (fill === "transparent") return "";
    return renderCircleHtml(box, fill);
  }
  if (box.type === "rect") {
    const fill = shapeFill(box);
    if (fill === "transparent") return "";
    const rx = Math.max(
      0,
      num((box.obj as FabricObject & { rx?: number }).rx) * box.scaleX,
    );
    return `<div style="display:block;width:100%;height:${px(box.h)}px;background:${esc(fill)};border-radius:${px(rx)}px;font-size:1px;line-height:1px;">&nbsp;</div>`;
  }
  return "";
}

function pctW(part: number, stageW: number) {
  if (stageW <= 0) return 0;
  return Math.round((Math.max(0, part) / stageW) * 10000) / 100;
}

/**
 * Place free-floating canvas objects at their real X/Y (matches PNG / designer).
 * Horizontal coords are % of the card width so they stay correct if the card
 * scales; the card itself is locked to design width in export + preview.
 */
function renderAbsoluteStageHtml(items: Bounds[], stageW: number): string {
  if (!items.length) return "";
  const top = Math.min(...items.map((i) => i.top));
  const bottom = Math.max(...items.map((i) => i.bottom));
  const height = Math.max(1, px(bottom - top));
  const ordered = [...items].sort(
    (a, b) => b.w * b.h - a.w * a.h || a.top - b.top || a.left - b.left,
  );
  const children = ordered
    .map((item) => {
      const inner = renderPositionedChildHtml(item, stageW);
      if (!inner) return "";
      return `<div style="position:absolute;left:${pctW(item.left, stageW)}%;top:${px(item.top - top)}px;width:${pctW(item.w, stageW)}%;line-height:0;font-size:0;z-index:1;">${inner}</div>`;
    })
    .filter(Boolean)
    .join("\n");

  // Full card width (cancel section gutter). width:100% of content + gutters.
  return [
    `<div class="grat-abs-stage" style="position:relative;left:-${SECTION_GUTTER}px;width:calc(100% + ${SECTION_GUTTER * 2}px);height:${height}px;margin:0;padding:0;overflow:visible;">`,
    children,
    `</div>`,
  ].join("\n");
}

/** CTA bar + accents + free shapes/text in one absolute stage (exact canvas coords). */
function renderMixedAbsoluteStageHtml(
  shape: Bounds,
  label: Bounds,
  accents: Bounds[],
  others: Bounds[],
  stageW: number,
): string {
  const fill = colorCss(shape.obj.fill, "#0f6b5c");
  const text = renderTextContentHtml(label, stageW);
  const rx = Math.max(
    0,
    num((shape.obj as FabricObject & { rx?: number }).rx) * shape.scaleX,
  );
  const radius = Math.round(rx);
  const barH = px(shape.h);
  const labelText = esc(String((label.obj as Textbox).text ?? "Button"));
  const labelInner = outlookColoredHtml(
    labelText,
    text.color,
    text.fontFamily,
    styleJoin([
      "text-decoration:none",
      `font-size:${px(text.fontSize)}px`,
      `font-weight:${esc(text.fontWeight === "normal" ? "600" : text.fontWeight)}`,
    ]),
  );
  const labelSpan = `<span style="color:${esc(text.color)};text-decoration:none;font-family:${esc(text.fontFamily)};font-size:${px(text.fontSize)}px;font-weight:${esc(text.fontWeight === "normal" ? "600" : text.fontWeight)};display:inline-block;mso-line-height-rule:exactly">${labelInner}</span>`;
  // width:100% of positioned wrapper so bar tracks % layout
  const bar = `<div class="grat-email-btn" style="display:block;width:100%;height:${barH}px;background:${esc(fill)};border-radius:${px(radius)}px;text-align:center;line-height:${barH}px;mso-line-height-rule:exactly;">${labelSpan}</div>`;

  const all = [shape, ...accents, ...others];
  const top = Math.min(...all.map((i) => i.top));
  const bottom = Math.max(...all.map((i) => i.bottom));
  const height = Math.max(1, px(bottom - top));

  const pieces: string[] = [
    `<div style="position:absolute;left:${pctW(shape.left, stageW)}%;top:${px(shape.top - top)}px;width:${pctW(shape.w, stageW)}%;z-index:2;">${bar}</div>`,
  ];

  for (const a of accents) {
    pieces.push(
      `<div style="position:absolute;left:${pctW(a.left, stageW)}%;top:${px(a.top - top)}px;width:${pctW(a.w, stageW)}%;line-height:0;font-size:0;z-index:3;">${renderCircleHtml(a, shapeFill(a) || fill)}</div>`,
    );
  }

  const orderedOthers = [...others].sort(
    (a, b) => b.w * b.h - a.w * a.h || a.top - b.top,
  );
  for (const o of orderedOthers) {
    const inner = renderPositionedChildHtml(o, stageW);
    if (!inner) continue;
    pieces.push(
      `<div style="position:absolute;left:${pctW(o.left, stageW)}%;top:${px(o.top - top)}px;width:${pctW(o.w, stageW)}%;line-height:0;font-size:0;z-index:1;">${inner}</div>`,
    );
  }

  return [
    `<div class="grat-abs-stage" style="position:relative;left:-${SECTION_GUTTER}px;width:calc(100% + ${SECTION_GUTTER * 2}px);height:${height}px;margin:0;padding:0;overflow:visible;">`,
    ...pieces,
    `</div>`,
  ].join("\n");
}

function isWideFlowText(box: Bounds, stageW: number) {
  return isText(box.type) && box.w >= stageW * 0.55;
}

function renderButtonHtml(
  shape: Bounds,
  label: Bounds,
  stageW: number,
  accents: Bounds[] = [],
) {
  const fill = colorCss(shape.obj.fill, "#0f6b5c");
  const text = renderTextContentHtml(label, stageW);
  const rx = Math.max(
    0,
    num((shape.obj as FabricObject & { rx?: number }).rx) * shape.scaleX,
  );
  // Use the designer corner radius (do not force a pill via height/2)
  const radius = Math.round(rx);
  const padY = Math.max(
    8,
    Math.min(28, Math.round((shape.h - text.fontSize * 1.2) / 2)),
  );

  const { widthPct, widthPx, fullBleed } = blockWidthInSection(shape.w, stageW);

  const labelText = esc(String((label.obj as Textbox).text ?? "Button"));
  const labelInner = outlookColoredHtml(
    labelText,
    text.color,
    text.fontFamily,
    styleJoin([
      "text-decoration:none",
      `font-size:${px(text.fontSize)}px`,
      `font-weight:${esc(text.fontWeight === "normal" ? "600" : text.fontWeight)}`,
    ]),
  );
  const labelSpan = `<span style="color:${esc(text.color)};text-decoration:none;font-family:${esc(text.fontFamily)};font-size:${px(text.fontSize)}px;font-weight:${esc(text.fontWeight === "normal" ? "600" : text.fontWeight)};display:inline-block;mso-line-height-rule:exactly">${labelInner}</span>`;

  const circle = accents
    .filter((a) => a.type === "circle" || a.type === "ellipse")
    .sort((a, b) => a.w * a.h - b.w * b.h || a.left - b.left)[0];

  if (circle) {
    // Absolute stage places the bar + accent at exact canvas coords (PNG match).
    const barH = px(shape.h);
    const bar = `<div class="grat-email-btn" style="display:block;width:100%;height:${barH}px;background:${esc(fill)};border-radius:${px(radius)}px;text-align:center;line-height:${barH}px;mso-line-height-rule:exactly;">${labelSpan}</div>`;
    const top = Math.min(shape.top, circle.top);
    const bottom = Math.max(shape.bottom, circle.bottom);
    const height = Math.max(1, px(bottom - top));
    return [
      `<div class="grat-abs-stage" style="position:relative;left:-${SECTION_GUTTER}px;width:calc(100% + ${SECTION_GUTTER * 2}px);height:${height}px;margin:0;padding:0;overflow:visible;">`,
      `  <div style="position:absolute;left:${pctW(shape.left, stageW)}%;top:${px(shape.top - top)}px;width:${pctW(shape.w, stageW)}%;z-index:1;">${bar}</div>`,
      `  <div style="position:absolute;left:${pctW(circle.left, stageW)}%;top:${px(circle.top - top)}px;width:${pctW(circle.w, stageW)}%;line-height:0;font-size:0;z-index:2;">${renderCircleHtml(circle, shapeFill(circle) || fill)}</div>`,
      `</div>`,
    ].join("\n");
  }

  const margin = fullBleed ? "margin:0;" : "margin:0 auto;";
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${fullBleed ? "left" : "center"}" width="${fullBleed ? "100%" : widthPx}" style="border-collapse:collapse;width:${widthPct}%;max-width:${fullBleed ? "100%" : `${widthPx}px`};${margin}">`,
    `  <tr>`,
    `    <td class="grat-email-btn" bgcolor="${esc(fill)}" align="center" style="background:${esc(fill)};border-radius:${px(radius)}px;padding:${padY}px 24px;width:100%;">`,
    `      ${labelSpan}`,
    `    </td>`,
    `  </tr>`,
    `</table>`,
  ].join("\n");
}

function shapeFill(box: Bounds) {
  return colorCss(box.obj.fill, "transparent");
}

type Block = {
  top: number;
  bottom: number;
  html: string;
};

type Section = {
  top: number;
  bottom: number;
  bg: string;
  padTop: number;
  padBottom: number;
  blocks: Block[];
};

function spacer(height: number) {
  const h = px(height);
  return `<div style="height:${h}px;line-height:${h}px;font-size:1px;mso-line-height-rule:exactly;">&nbsp;</div>`;
}

/**
 * Email HTML that mirrors the designer canvas 1:1.
 * Fixed W×H card + every object at its canvas left/top — same box as the PNG.
 * (Classic Outlook Desktop may flatten absolute layout; Web/Gmail keep it.)
 */
export function exportCanvasToEmailHtml(
  canvas: Canvas,
  opts?: {
    width?: number;
    height?: number;
    frame?: Frame;
    alt?: string;
  },
) {
  // Prefer live canvas size so HTML stage matches the PNG raster exactly.
  const stageW = px(opts?.width ?? canvas.getWidth() ?? DESIGN_WIDTH);
  const stageH = px(opts?.height ?? canvas.getHeight() ?? DESIGN_HEIGHT);
  void opts?.alt;
  const frame = opts?.frame;
  const bg =
    typeof canvas.backgroundColor === "string"
      ? canvas.backgroundColor
      : "#ffffff";

  const radius = Math.max(0, frame?.radius ?? 0);
  const borderW = Math.max(0, frame?.borderWidth ?? 0);
  const borderColor = frame?.borderColor ?? "#1c2420";

  // Fabric getObjects(): index 0 = back, last = front
  const rawObjects = canvas
    .getObjects()
    .filter((o) => !(o as FabricObject & { gratCropFrame?: boolean }).gratCropFrame);

  // Refresh matrices so getBoundingRect matches what toCanvasElement paints.
  for (const obj of rawObjects) {
    if (typeof obj.setCoords === "function") obj.setCoords();
  }

  const layers: Array<{ box: Bounds; z: number }> = [];
  rawObjects.forEach((obj, index) => {
    const box = boundsOf(obj);
    if (!box) return;
    layers.push({ box, z: index + 1 });
  });

  const cardBorder = borderW
    ? `border:${px(borderW)}px solid ${esc(borderColor)};`
    : "border:1px solid #dddddd;";
  const cardRadius = radius ? `border-radius:${px(radius)}px;` : "";

  const title = esc(opts?.alt?.trim() || "Email");

  function asFullDocument(cardBody: string) {
    return [
      `<!DOCTYPE html>`,
      `<html lang="en">`,
      `<head>`,
      `  <meta charset="utf-8" />`,
      `  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />`,
      `  <meta name="viewport" content="width=${stageW}, initial-scale=1" />`,
      `  <meta name="x-apple-disable-message-reformatting" />`,
      `  <title>${title}</title>`,
      `  <!--[if mso]>`,
      `  <noscript>`,
      `    <xml>`,
      `      <o:OfficeDocumentSettings>`,
      `        <o:PixelsPerInch>96</o:PixelsPerInch>`,
      `      </o:OfficeDocumentSettings>`,
      `    </xml>`,
      `  </noscript>`,
      `  <![endif]-->`,
      `  <style type="text/css">`,
      `    html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; }`,
      `    body { background: #f0f0f0; }`,
      `    img { border: 0; outline: none; text-decoration: none; }`,
      `    table { border-collapse: collapse; }`,
      `    .grat-canvas-stage { position: relative; }`,
      `    .grat-obj { position: absolute; }`,
      `  </style>`,
      `</head>`,
      `<body style="margin:0;padding:0;background:#f0f0f0;">`,
      cardBody,
      `</body>`,
      `</html>`,
    ].join("\n");
  }

  if (!layers.length) {
    return asFullDocument(
      [
        `<table role="presentation" class="grat-email-card" cellpadding="0" cellspacing="0" border="0" width="${stageW}" height="${stageH}" style="border-collapse:collapse;width:${stageW}px;height:${stageH}px;min-width:${stageW}px;max-width:${stageW}px;background:${esc(bg)};${cardBorder}${cardRadius}">`,
        `  <tr><td style="padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#666;">Empty card</td></tr>`,
        `</table>`,
      ].join("\n"),
    );
  }

  const children = layers
    .map(({ box, z }) => {
      const inner = renderCanvasObjectHtml(box, stageW);
      if (!inner) return "";
      const left = px(box.left);
      const top = px(box.top);
      const bw = px(box.w);
      const bh = px(box.h);
      // Circles/ellipses keep square box; text/images use canvas bounds.
      return [
        `<div class="grat-obj" style="position:absolute;left:${left}px;top:${top}px;width:${bw}px;height:${bh}px;z-index:${z};overflow:hidden;line-height:normal;font-size:0;">`,
        inner,
        `</div>`,
      ].join("");
    })
    .filter(Boolean)
    .join("\n      ");

  const body = [
    `<!--[if mso]><style type="text/css">table,td{font-family:Segoe UI,Arial,sans-serif !important;}</style><![endif]-->`,
    `<table role="presentation" class="grat-email-card" cellpadding="0" cellspacing="0" border="0" width="${stageW}" height="${stageH}" style="border-collapse:collapse;table-layout:fixed;width:${stageW}px;height:${stageH}px;min-width:${stageW}px;max-width:${stageW}px;min-height:${stageH}px;max-height:${stageH}px;margin:0 auto;background:${esc(bg)};${cardBorder}${cardRadius}overflow:hidden;">`,
    `  <tr>`,
    `    <td valign="top" height="${stageH}" style="padding:0;margin:0;width:${stageW}px;height:${stageH}px;font-size:0;line-height:0;vertical-align:top;">`,
    `      <!--[if mso]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${stageW}px;height:${stageH}px;"><v:fill color="${esc(bg)}" /><v:textbox inset="0,0,0,0"><![endif]-->`,
    `      <div class="grat-canvas-stage" style="position:relative;width:${stageW}px;height:${stageH}px;min-width:${stageW}px;min-height:${stageH}px;max-width:${stageW}px;max-height:${stageH}px;overflow:hidden;background:${esc(bg)};margin:0;padding:0;">`,
    `      ${children}`,
    `      </div>`,
    `      <!--[if mso]></v:textbox></v:rect><![endif]-->`,
    `    </td>`,
    `  </tr>`,
    `</table>`,
  ].join("\n");

  return asFullDocument(body);
}

/** Render one Fabric object to fill its absolute parent box (100% × 100%). */
function renderCanvasObjectHtml(box: Bounds, stageW: number): string {
  if (isText(box.type)) {
    // Fill the text box; keep designer alignment / colors.
    const text = renderTextContentHtml(box, stageW);
    return `<div style="width:100%;height:100%;box-sizing:border-box;overflow:hidden;">${text.html}</div>`;
  }
  if (isImage(box.type)) {
    const image = box.obj as FabricImage;
    const rawSrc =
      typeof image.getSrc === "function"
        ? image.getSrc()
        : typeof (image as FabricImage & { src?: string }).src === "string"
          ? (image as FabricImage & { src?: string }).src!
          : "";
    const src = resolveImageSrc(rawSrc);
    if (!src) return "";
    return `<img src="${esc(src)}" alt="" width="${px(box.w)}" height="${px(box.h)}" style="display:block;border:0;outline:none;width:100%;height:100%;object-fit:fill;" />`;
  }
  if (box.type === "circle" || box.type === "ellipse") {
    const fill = shapeFill(box);
    if (fill === "transparent") return "";
    return `<div class="grat-email-circle" style="display:block;width:100%;height:100%;background:${esc(fill)};border-radius:50%;font-size:1px;line-height:0;">&nbsp;</div>`;
  }
  if (box.type === "rect") {
    const fill = shapeFill(box);
    if (fill === "transparent") return "";
    const rx = Math.max(
      0,
      num((box.obj as FabricObject & { rx?: number }).rx) * box.scaleX,
    );
    return `<div style="display:block;width:100%;height:100%;background:${esc(fill)};border-radius:${px(rx)}px;font-size:1px;line-height:0;">&nbsp;</div>`;
  }
  // Lines / other: skip for now
  return "";
}
