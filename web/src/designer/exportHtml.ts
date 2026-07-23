import type { Canvas, FabricObject, FabricImage, Textbox } from "fabric";
import { absoluteUploadUrl, DESIGN_HEIGHT, DESIGN_WIDTH } from "./compile";

type Frame = {
  radius: number;
  borderWidth: number;
  borderColor: string;
};

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function colorCss(value: unknown, fallback = "transparent") {
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Whole pixels — avoids 97.80000000000001px in saved HTML. */
function px(value: number) {
  return Math.round(value);
}

function opacityCss(opacity: number) {
  if (!Number.isFinite(opacity) || opacity >= 0.999) return null;
  return `opacity:${Math.round(opacity * 100) / 100}`;
}

function dashCss(obj: FabricObject) {
  const dash = obj.strokeDashArray;
  if (!Array.isArray(dash) || !dash.length) return "";
  return ` stroke-dasharray="${dash.map((n) => px(Number(n))).join(" ")}"`;
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

/** Convert fabric left/top (respecting origin) into CSS top-left. */
function cssTopLeft(obj: FabricObject, w: number, h: number) {
  let left = num(obj.left);
  let top = num(obj.top);
  const ox = obj.originX ?? "left";
  const oy = obj.originY ?? "top";
  if (ox === "center") left -= w / 2;
  else if (ox === "right") left -= w;
  if (oy === "center") top -= h / 2;
  else if (oy === "bottom") top -= h;
  return { left: px(left), top: px(top) };
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

function borderCss(
  strokeWidth: number,
  stroke: string,
  dashed: boolean,
  radiusPx?: number,
) {
  const parts: string[] = [];
  if (strokeWidth > 0 && stroke !== "transparent") {
    parts.push(
      `border:${px(strokeWidth)}px ${dashed ? "dashed" : "solid"} ${stroke}`,
    );
  } else {
    parts.push("border:0");
  }
  if (radiusPx != null && radiusPx > 0) {
    parts.push(`border-radius:${px(radiusPx)}px`);
  }
  parts.push("box-sizing:border-box");
  return parts.join(";");
}

function styleJoin(parts: Array<string | null | false | undefined>) {
  return parts.filter(Boolean).join(";");
}

/** Full email HTML from designer objects — rounded px + indented for readability. */
export function exportCanvasToEmailHtml(
  canvas: Canvas,
  opts?: {
    width?: number;
    height?: number;
    frame?: Frame;
    alt?: string;
  },
) {
  const width = px(opts?.width ?? DESIGN_WIDTH);
  const height = px(opts?.height ?? DESIGN_HEIGHT);
  const frame = opts?.frame;
  const bg =
    typeof canvas.backgroundColor === "string"
      ? canvas.backgroundColor
      : "#ffffff";

  const radius = Math.max(0, frame?.radius ?? 0);
  const borderW = Math.max(0, frame?.borderWidth ?? 0);
  const borderColor = frame?.borderColor ?? "#1c2420";

  const stageStyle = styleJoin([
    "position:relative",
    `width:${width}px`,
    `height:${height}px`,
    `background:${bg}`,
    "overflow:hidden",
    "margin:0 auto",
    radius ? `border-radius:${px(radius)}px` : null,
    borderW ? `border:${px(borderW)}px solid ${borderColor}` : "border:0",
    // Match designer canvas coords — border draws outside the 600×N stage
    "box-sizing:content-box",
  ]);

  const layers = canvas
    .getObjects()
    .filter((o) => !(o as FabricObject & { gratCropFrame?: boolean }).gratCropFrame)
    .map((obj, index) => renderObject(obj, index, width))
    .filter(Boolean)
    .map((line) => `    ${line}`)
    .join("\n");

  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;max-width:${width + borderW * 2}px;margin:0 auto;">`,
    `  <tr>`,
    `    <td style="padding:0;">`,
    `      <div style="${stageStyle}">`,
    layers,
    `      </div>`,
    `    </td>`,
    `  </tr>`,
    `</table>`,
  ].join("\n");
}

function renderObject(obj: FabricObject, zIndex: number, stageWidth: number): string {
  const type = (obj.type ?? "").toLowerCase();
  const angle = num(obj.angle);
  const opacity = obj.opacity == null ? 1 : num(obj.opacity, 1);
  const { w: scaledW, h: scaledH, scaleX, scaleY } = scaledSize(obj);

  const common = (left: number, top: number, extra: string) =>
    styleJoin([
      "position:absolute",
      `left:${px(left)}px`,
      `top:${px(top)}px`,
      `z-index:${zIndex + 1}`,
      opacityCss(opacity),
      angle
        ? `transform:rotate(${Math.round(angle)}deg);transform-origin:center center`
        : null,
      extra,
    ]);

  if (type === "textbox" || type === "i-text" || type === "text") {
    const text = obj as Textbox;
    const boxW = Math.max(1, num(text.width) * scaleX);
    const fontSize = Math.max(1, num(text.fontSize, 16) * scaleY);
    const fill = colorCss(text.fill, "#1c2420");
    const fontFamily =
      typeof text.fontFamily === "string"
        ? text.fontFamily
        : "Segoe UI, Arial, sans-serif";
    const alignRaw =
      typeof text.textAlign === "string" ? text.textAlign.toLowerCase() : "left";
    let align: "left" | "center" | "right" | "justify" =
      alignRaw === "center" || alignRaw === "right" || alignRaw === "justify"
        ? alignRaw
        : "left";
    const fontWeight = text.fontWeight != null ? String(text.fontWeight) : "normal";
    const fontStyle = text.fontStyle === "italic" ? "italic" : "normal";
    const underline = Boolean(text.underline);
    const { left: boxLeft, top } = cssTopLeft(obj, boxW, Math.max(fontSize, scaledH));
    const content = esc(String(text.text ?? "")).replace(/\r\n|\r|\n/g, "<br/>");
    const lineHeight =
      typeof text.lineHeight === "number" && text.lineHeight > 0
        ? Math.round(text.lineHeight * 100) / 100
        : 1.5;
    const shadow = text.shadow as
      | { color?: string; blur?: number; offsetX?: number; offsetY?: number }
      | string
      | null
      | undefined;
    let textShadow: string | null = null;
    if (shadow && typeof shadow !== "string") {
      const ox = Math.round(Number(shadow.offsetX ?? 0));
      const oy = Math.round(Number(shadow.offsetY ?? 0));
      const blur = Math.round(Number(shadow.blur ?? 0));
      const color =
        typeof shadow.color === "string" && shadow.color.trim()
          ? shadow.color
          : "rgba(0,0,0,0.35)";
      textShadow = `text-shadow:${ox}px ${oy}px ${blur}px ${color}`;
    }

    // Infer center when a non-full-width box sits on the page midline
    // (common after snapping) but textAlign was left — designer looks centered.
    const boxCx = boxLeft + boxW / 2;
    const fullBleed =
      boxLeft <= 24 && boxW >= stageWidth * 0.85;
    if (
      align === "left" &&
      !fullBleed &&
      Math.abs(boxCx - stageWidth / 2) <= 18
    ) {
      align = "center";
    }

    // Center/right: span the stage so email clients match the designer
    let left = boxLeft;
    let width = boxW;
    if (align === "center" || align === "right") {
      left = 0;
      width = stageWidth;
    }

    return `<div style="${common(
      left,
      top,
      styleJoin([
        `width:${px(width)}px`,
        `font-size:${px(fontSize)}px`,
        `line-height:${lineHeight}`,
        `color:${fill}`,
        `font-family:${esc(fontFamily)}`,
        `font-weight:${esc(fontWeight)}`,
        `font-style:${fontStyle}`,
        underline ? "text-decoration:underline" : null,
        `text-align:${align}`,
        textShadow,
        "word-break:break-word",
      ]),
    )}">${content}</div>`;
  }

  if (type === "image") {
    const image = obj as FabricImage;
    const rawSrc =
      typeof image.getSrc === "function"
        ? image.getSrc()
        : typeof (image as FabricImage & { src?: string }).src === "string"
          ? (image as FabricImage & { src?: string }).src!
          : "";
    const src = resolveImageSrc(rawSrc);
    if (!src) return "";
    const w = scaledW;
    const h = scaledH;
    const { left, top } = cssTopLeft(obj, w, h);
    let radius = 0;
    const clip = image.clipPath as { rx?: number; type?: string } | undefined;
    if (clip && typeof clip.rx === "number") radius = clip.rx * scaleX;
    return `<img src="${esc(src)}" width="${px(w)}" height="${px(h)}" alt="" style="${common(
      left,
      top,
      styleJoin([
        `width:${px(w)}px`,
        `height:${px(h)}px`,
        "display:block",
        "border:0",
        radius ? `border-radius:${px(radius)}px` : null,
        "object-fit:cover",
      ]),
    )}" />`;
  }

  if (type === "rect") {
    const w = Math.max(1, num(obj.width) * scaleX);
    const h = Math.max(1, num(obj.height) * scaleY);
    const { left, top } = cssTopLeft(obj, w, h);
    const fill = colorCss(obj.fill, "transparent");
    const stroke = colorCss(obj.stroke, "transparent");
    const strokeWidth = num(obj.strokeWidth);
    const rx = num((obj as FabricObject & { rx?: number }).rx) * scaleX;
    const ry = num((obj as FabricObject & { ry?: number }).ry) * scaleY;
    const r = Math.max(rx, ry);
    return `<div style="${common(
      left,
      top,
      styleJoin([
        `width:${px(w)}px`,
        `height:${px(h)}px`,
        `background:${fill}`,
        borderCss(strokeWidth, stroke, Boolean(obj.strokeDashArray?.length), r),
      ]),
    )}"></div>`;
  }

  if (type === "circle") {
    const radius = num((obj as FabricObject & { radius?: number }).radius) * scaleX;
    const size = Math.max(1, radius * 2);
    const { left, top } = cssTopLeft(obj, size, size);
    const fill = colorCss(obj.fill, "transparent");
    const stroke = colorCss(obj.stroke, "transparent");
    const strokeWidth = num(obj.strokeWidth);
    return `<div style="${common(
      left,
      top,
      styleJoin([
        `width:${px(size)}px`,
        `height:${px(size)}px`,
        `background:${fill}`,
        strokeWidth > 0 && stroke !== "transparent"
          ? `border:${px(strokeWidth)}px ${obj.strokeDashArray?.length ? "dashed" : "solid"} ${stroke}`
          : "border:0",
        "border-radius:50%",
        "box-sizing:border-box",
      ]),
    )}"></div>`;
  }

  if (type === "ellipse") {
    const rx = num((obj as FabricObject & { rx?: number }).rx) * scaleX;
    const ry = num((obj as FabricObject & { ry?: number }).ry) * scaleY;
    const w = Math.max(1, rx * 2);
    const h = Math.max(1, ry * 2);
    const { left, top } = cssTopLeft(obj, w, h);
    const fill = colorCss(obj.fill, "transparent");
    const stroke = colorCss(obj.stroke, "transparent");
    const strokeWidth = num(obj.strokeWidth);
    return `<div style="${common(
      left,
      top,
      styleJoin([
        `width:${px(w)}px`,
        `height:${px(h)}px`,
        `background:${fill}`,
        strokeWidth > 0 && stroke !== "transparent"
          ? `border:${px(strokeWidth)}px ${obj.strokeDashArray?.length ? "dashed" : "solid"} ${stroke}`
          : "border:0",
        "border-radius:50%",
        "box-sizing:border-box",
      ]),
    )}"></div>`;
  }

  if (type === "line") {
    const line = obj as FabricObject & {
      x1?: number;
      y1?: number;
      x2?: number;
      y2?: number;
    };
    const x1 = num(line.x1);
    const y1 = num(line.y1);
    const x2 = num(line.x2);
    const y2 = num(line.y2);
    const stroke = colorCss(obj.stroke, "#1c2420");
    const strokeWidth = Math.max(1, num(obj.strokeWidth, 2));
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const w = Math.max(1, Math.abs(x2 - x1));
    const h = Math.max(1, Math.abs(y2 - y1));
    const boxW = Math.max(w, strokeWidth);
    const boxH = Math.max(h, strokeWidth);
    const left = Number.isFinite(obj.left) ? num(obj.left) : minX;
    const top = Number.isFinite(obj.top) ? num(obj.top) : minY;
    return `<svg width="${px(boxW)}" height="${px(boxH)}" style="${common(
      left,
      top,
      styleJoin([
        `width:${px(boxW)}px`,
        `height:${px(boxH)}px`,
        "overflow:visible",
      ]),
    )}" xmlns="http://www.w3.org/2000/svg"><line x1="${px(x1 - minX)}" y1="${px(y1 - minY)}" x2="${px(x2 - minX)}" y2="${px(y2 - minY)}" stroke="${esc(stroke)}" stroke-width="${px(strokeWidth)}"${dashCss(obj)} /></svg>`;
  }

  if (type === "polygon" || type === "polyline") {
    const poly = obj as FabricObject & {
      points?: Array<{ x: number; y: number }>;
    };
    const points = poly.points ?? [];
    if (!points.length) return "";
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const w = Math.max(1, (maxX - minX) * scaleX);
    const h = Math.max(1, (maxY - minY) * scaleY);
    const { left, top } = cssTopLeft(obj, w, h);
    const fill = colorCss(obj.fill, "transparent");
    const stroke = colorCss(obj.stroke, "transparent");
    const strokeWidth = num(obj.strokeWidth);
    const pts = points
      .map(
        (p) =>
          `${px((p.x - minX) * scaleX)},${px((p.y - minY) * scaleY)}`,
      )
      .join(" ");
    const tag = type === "polyline" ? "polyline" : "polygon";
    return `<svg width="${px(w)}" height="${px(h)}" viewBox="0 0 ${px(w)} ${px(h)}" style="${common(
      left,
      top,
      styleJoin([
        `width:${px(w)}px`,
        `height:${px(h)}px`,
        "overflow:visible",
      ]),
    )}" xmlns="http://www.w3.org/2000/svg"><${tag} points="${pts}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${px(strokeWidth)}"${dashCss(obj)} /></svg>`;
  }

  return "";
}
