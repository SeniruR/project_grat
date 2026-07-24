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

function colorCss(value: unknown, fallback = "transparent") {
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
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

function resolveImageSrc(src: string) {
  if (!src) return "";
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  const key = src.replace(/^\/+uploads\/+/i, "").replace(/^\/+/, "");
  if (key.includes("/") || /\.(jpe?g|png|gif|webp)$/i.test(key)) {
    return absoluteUploadUrl(key);
  }
  return src;
}

function boundsOf(obj: FabricObject): Bounds | null {
  const type = (obj.type ?? "").toLowerCase();
  if (!type || type === "activeselection" || type === "group") return null;
  const { w, h, scaleX, scaleY } = scaledSize(obj);
  let left: number;
  let top: number;
  let bw = w;
  let bh = h;

  if (type === "circle") {
    const radius = num((obj as FabricObject & { radius?: number }).radius) * scaleX;
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

function overlaps(a: Bounds, b: Bounds, pad = 4) {
  return !(
    a.right < b.left - pad ||
    a.left > b.right + pad ||
    a.bottom < b.top - pad ||
    a.top > b.bottom + pad
  );
}

function textAlignOf(obj: FabricObject, box: Bounds, stageW: number) {
  const text = obj as Textbox;
  const alignRaw =
    typeof text.textAlign === "string" ? text.textAlign.toLowerCase() : "left";
  let align: "left" | "center" | "right" =
    alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
  if (
    align === "left" &&
    box.w >= stageW * 0.45 &&
    Math.abs(box.cx - stageW / 2) <= 18
  ) {
    align = "center";
  }
  if (isFullBleed(box, stageW) && Math.abs(box.cx - stageW / 2) <= 40) {
    align = "center";
  }
  return align;
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

  return {
    html: `<div style="${styleJoin([
      `font-size:${px(fontSize)}px`,
      `line-height:${lineHeight}`,
      `color:${fill}`,
      `font-family:${esc(fontFamily)}`,
      `font-weight:${esc(fontWeight)}`,
      `font-style:${fontStyle}`,
      underline ? "text-decoration:underline" : null,
      `text-align:${align}`,
      "word-break:break-word",
      "mso-line-height-rule:exactly",
    ])}">${content}</div>`,
    align,
    color: fill,
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
  const widthPct = pct(box.w, stageW);
  const align =
    Math.abs(box.cx - stageW / 2) <= 24
      ? "center"
      : box.left < stageW * 0.2
        ? "left"
        : "right";
  return `<img src="${esc(src)}" alt="" width="${px(box.w)}" style="display:block;border:0;width:${widthPct}%;max-width:${px(box.w)}px;height:auto;${align === "center" ? "margin:0 auto;" : ""}" />`;
}

function renderButtonHtml(
  shape: Bounds,
  label: Bounds,
  stageW: number,
) {
  const fill = colorCss(shape.obj.fill, "#0f6b5c");
  const text = renderTextHtml(label, stageW);
  const radius = Math.max(
    0,
    num((shape.obj as FabricObject & { rx?: number }).rx) * shape.scaleX,
  );
  // Outlook-friendly table button
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">`,
    `  <tr>`,
    `    <td bgcolor="${esc(fill)}" style="background:${esc(fill)};border-radius:${px(radius)}px;padding:12px 24px;">`,
    `      <a href="#" style="color:${esc(text.color === "#ffffff" || text.color === "#fff" ? "#ffffff" : text.color)};text-decoration:none;font-family:Segoe UI,Arial,sans-serif;font-size:16px;font-weight:600;display:inline-block;">${esc(String((label.obj as Textbox).text ?? "Button"))}</a>`,
    `    </td>`,
    `  </tr>`,
    `</table>`,
  ].join("\n");
}

function shapeFill(box: Bounds) {
  return colorCss(box.obj.fill, "transparent");
}

type Section = {
  top: number;
  bottom: number;
  bg: string;
  padTop: number;
  padBottom: number;
  blocks: string[];
};

/**
 * Responsive, Outlook-friendly email HTML from the designer canvas.
 * Uses fluid tables (width 100% + max-width) — no position:absolute.
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
  const stageW = px(opts?.width ?? DESIGN_WIDTH);
  void opts?.height;
  void DESIGN_HEIGHT;
  const frame = opts?.frame;
  const bg =
    typeof canvas.backgroundColor === "string"
      ? canvas.backgroundColor
      : "#ffffff";

  const radius = Math.max(0, frame?.radius ?? 0);
  const borderW = Math.max(0, frame?.borderWidth ?? 0);
  const borderColor = frame?.borderColor ?? "#1c2420";

  const items = canvas
    .getObjects()
    .filter((o) => !(o as FabricObject & { gratCropFrame?: boolean }).gratCropFrame)
    .map(boundsOf)
    .filter((b): b is Bounds => Boolean(b))
    .sort((a, b) => a.top - b.top || a.left - b.left);

  if (!items.length) {
    return [
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;max-width:${stageW}px;margin:0 auto;background:${esc(bg)};">`,
      `  <tr><td style="padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#666;">Empty card</td></tr>`,
      `</table>`,
    ].join("\n");
  }

  const used = new Set<Bounds>();
  const bands = items.filter(
    (b) => isShape(b.type) && isFullBleed(b, stageW) && shapeFill(b) !== "transparent",
  );

  const sections: Section[] = [];

  for (const band of bands) {
    if (used.has(band)) continue;
    used.add(band);

    const section: Section = {
      top: band.top,
      bottom: band.bottom,
      bg: shapeFill(band),
      padTop: 16,
      padBottom: 16,
      blocks: [],
    };

    // Texts / images / small shapes whose center lies in this band
    const members = items.filter(
      (b) =>
        b !== band &&
        !used.has(b) &&
        b.cy >= band.top - 8 &&
        b.cy <= band.bottom + 8,
    );

    // Pair buttons: shape + overlapping text
    for (const member of [...members].sort((a, b) => a.top - b.top)) {
      if (used.has(member)) continue;

      if (isShape(member.type) && !isFullBleed(member, stageW)) {
        const label = members.find(
          (t) =>
            isText(t.type) &&
            !used.has(t) &&
            overlaps(member, t, 12),
        );
        if (label) {
          used.add(member);
          used.add(label);
          section.blocks.push(renderButtonHtml(member, label, stageW));
          continue;
        }
      }

      if (isText(member.type)) {
        used.add(member);
        section.blocks.push(renderTextHtml(member, stageW).html);
        continue;
      }
      if (isImage(member.type)) {
        used.add(member);
        const img = renderImageHtml(member, stageW);
        if (img) section.blocks.push(img);
        continue;
      }
      if (isShape(member.type) && shapeFill(member) !== "transparent") {
        // Decorative non-full-bleed shape inside band — skip empty décor or show as spacer
        used.add(member);
        if (member.type === "circle" || member.type === "ellipse") {
          const fill = shapeFill(member);
          const size = Math.min(member.w, member.h);
          section.blocks.push(
            `<div style="width:${px(size)}px;height:${px(size)}px;max-width:40%;background:${esc(fill)};border-radius:50%;margin:8px auto 0;">&nbsp;</div>`,
          );
        }
      }
    }

    // If band had no text (pure color bar), keep min height via padding
    if (!section.blocks.length) {
      section.padTop = Math.max(12, Math.round(band.h / 2 - 8));
      section.padBottom = section.padTop;
      section.blocks.push("&nbsp;");
    }

    sections.push(section);
  }

  // Remaining content not in a color band — each cluster by Y becomes a white section
  const rest = items.filter((b) => !used.has(b)).sort((a, b) => a.top - b.top);
  let i = 0;
  while (i < rest.length) {
    const seed = rest[i];
    const rowItems = [seed];
    used.add(seed);
    i += 1;
    // gather near-vertical neighbors for possible multi-col (keep simple: same row if tops close)
    while (i < rest.length && Math.abs(rest[i].top - seed.top) < 28) {
      rowItems.push(rest[i]);
      used.add(rest[i]);
      i += 1;
    }

    // expand to include button pairs overlapping shapes in row
    for (const r of [...rowItems]) {
      if (!isShape(r.type)) continue;
      const label = rest.find(
        (t) => isText(t.type) && !used.has(t) && overlaps(r, t, 12),
      );
      if (label) {
        rowItems.push(label);
        used.add(label);
      }
    }

    const blocks: string[] = [];
    const shapes = rowItems.filter((r) => isShape(r.type));
    const texts = rowItems.filter((r) => isText(r.type));
    const images = rowItems.filter((r) => isImage(r.type));

    for (const shape of shapes) {
      const label = texts.find((t) => overlaps(shape, t, 12));
      if (label) {
        blocks.push(renderButtonHtml(shape, label, stageW));
        texts.splice(texts.indexOf(label), 1);
      }
    }
    for (const t of texts.sort((a, b) => a.top - b.top)) {
      blocks.push(renderTextHtml(t, stageW).html);
    }
    for (const im of images.sort((a, b) => a.top - b.top)) {
      const html = renderImageHtml(im, stageW);
      if (html) blocks.push(html);
    }

    if (!blocks.length) continue;
    sections.push({
      top: Math.min(...rowItems.map((r) => r.top)),
      bottom: Math.max(...rowItems.map((r) => r.bottom)),
      bg,
      padTop: 20,
      padBottom: 20,
      blocks,
    });
  }

  sections.sort((a, b) => a.top - b.top);

  const cardBorder = borderW
    ? `border:${px(borderW)}px solid ${esc(borderColor)};`
    : "border:1px solid #dddddd;";
  const cardRadius = radius ? `border-radius:${px(radius)}px;` : "";

  const bodyRows = sections
    .map((sec) => {
      const inner = sec.blocks
        .map(
          (block, idx) =>
            `        ${idx === 0 ? block : `<div style="height:12px;line-height:12px;font-size:12px;">&nbsp;</div>\n        ${block}`}`,
        )
        .join("\n");
      return [
        `      <tr>`,
        `        <td bgcolor="${esc(sec.bg)}" style="background:${esc(sec.bg)};padding:${px(sec.padTop)}px 24px ${px(sec.padBottom)}px 24px;font-family:Segoe UI,Arial,sans-serif;">`,
        inner,
        `        </td>`,
        `      </tr>`,
      ].join("\n");
    })
    .join("\n");

  return [
    `<!--[if mso]><style type="text/css">table,td{font-family:Segoe UI,Arial,sans-serif !important;}</style><![endif]-->`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;background:#f0f0f0;margin:0;padding:0;">`,
    `  <tr>`,
    `    <td align="center" style="padding:16px 8px;">`,
    `      <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${stageW}"><tr><td><![endif]-->`,
    `      <table role="presentation" class="grat-email-card" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;max-width:${stageW}px;background:${esc(bg)};${cardBorder}${cardRadius}overflow:hidden;">`,
    bodyRows ||
      `      <tr><td style="padding:24px;">&nbsp;</td></tr>`,
    `      </table>`,
    `      <!--[if mso]></td></tr></table><![endif]-->`,
    `    </td>`,
    `  </tr>`,
    `</table>`,
  ].join("\n");
}
