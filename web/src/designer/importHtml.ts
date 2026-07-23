import {
  Canvas,
  Circle,
  Ellipse,
  FabricImage,
  Line,
  Polygon,
  Rect,
  Shadow,
  Textbox,
} from "fabric";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "./compile";

export type ImportedFrame = {
  radius: number;
  borderWidth: number;
  borderColor: string;
};

export type ImportHtmlResult = {
  objectCount: number;
  width?: number;
  height?: number;
  frame?: ImportedFrame;
  background?: string;
  warnings: string[];
};

function parseStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of style.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const key = part.slice(0, i).trim().toLowerCase();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function px(value: string | undefined, fallback = 0) {
  if (!value) return fallback;
  if (/auto/i.test(value)) return fallback;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pixel length only — ignores %, auto, and bare keywords. */
function pxLength(value: string | undefined | null): number | null {
  if (!value) return null;
  const v = value.trim();
  if (!v || /auto/i.test(v) || /%/.test(v)) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function attrWidthPx(el: Element): number | null {
  const attr = el.getAttribute("width");
  if (!attr || /%/.test(attr)) return null;
  const n = Number.parseFloat(attr);
  return Number.isFinite(n) ? n : null;
}

/** Resolve email card width from style, attrs, ancestors, or design default. */
function resolveCardWidth(el: HTMLElement): number {
  const style = parseStyle(styleAttr(el));
  const direct = [
    pxLength(style.width),
    pxLength(style["max-width"]),
    attrWidthPx(el),
  ].filter((n): n is number => n != null && n >= 280);
  if (direct.length) return Math.round(Math.max(...direct));

  let p: HTMLElement | null = el.parentElement;
  while (p && p !== el.ownerDocument?.body) {
    const ps = parseStyle(styleAttr(p));
    const fromParent = [
      pxLength(ps["max-width"]),
      pxLength(ps.width),
      attrWidthPx(p),
    ].filter((n): n is number => n != null && n >= 280);
    if (fromParent.length) return Math.round(Math.max(...fromParent));
    p = p.parentElement;
  }

  // Typical fluid email card: width=100% and/or border frame
  const wHint = (el.getAttribute("width") ?? style.width ?? "").trim();
  const looksFluid = /^100%$/.test(wHint) || /^100%$/.test((style.width ?? "").trim());
  if (looksFluid || style.border || style["border-radius"]) return DESIGN_WIDTH;
  return 0;
}

function angleFromTransform(transform: string | undefined) {
  if (!transform) return 0;
  const m = /rotate\(\s*(-?[\d.]+)deg\s*\)/i.exec(transform);
  return m ? Number.parseFloat(m[1]) : 0;
}

function isTransparent(color: string | undefined) {
  if (!color) return true;
  const c = color.trim().toLowerCase();
  return c === "transparent" || c === "rgba(0, 0, 0, 0)" || c === "rgba(0,0,0,0)";
}

function styleAttr(el: Element) {
  return el.getAttribute("style") ?? "";
}

function isAbsoluteEl(el: HTMLElement) {
  const style = styleAttr(el);
  return /position:\s*absolute/i.test(style);
}

function isRelativeEl(el: HTMLElement) {
  const style = styleAttr(el);
  return /position:\s*relative/i.test(style);
}

function marginAutoX(styleStr: string, style: Record<string, string>) {
  if (/margin:\s*[^;]*\s+auto/i.test(styleStr)) return true;
  if (/^auto$/i.test(style["margin-left"] ?? "") && /^auto$/i.test(style["margin-right"] ?? "")) {
    return true;
  }
  return false;
}

function boxMargins(style: Record<string, string>, styleStr: string) {
  const shorthand = style.margin ?? "";
  const parts = shorthand.trim().split(/\s+/).filter(Boolean);
  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;
  if (parts.length === 1 && !/auto/i.test(parts[0])) {
    top = right = bottom = left = px(parts[0]);
  } else if (parts.length === 2) {
    top = bottom = px(parts[0]);
    right = left = /auto/i.test(parts[1]) ? 0 : px(parts[1]);
  } else if (parts.length === 3) {
    top = px(parts[0]);
    right = left = /auto/i.test(parts[1]) ? 0 : px(parts[1]);
    bottom = px(parts[2]);
  } else if (parts.length >= 4) {
    top = px(parts[0]);
    right = /auto/i.test(parts[1]) ? 0 : px(parts[1]);
    bottom = px(parts[2]);
    left = /auto/i.test(parts[3]) ? 0 : px(parts[3]);
  }
  if (style["margin-top"]) top = px(style["margin-top"], top);
  if (style["margin-bottom"]) bottom = px(style["margin-bottom"], bottom);
  if (style["margin-left"] && !/auto/i.test(style["margin-left"])) {
    left = px(style["margin-left"], left);
  }
  if (style["margin-right"] && !/auto/i.test(style["margin-right"])) {
    right = px(style["margin-right"], right);
  }
  return { top, right, bottom, left, centerX: marginAutoX(styleStr, style) };
}

function boxPadding(style: Record<string, string>) {
  const shorthand = style.padding ?? "";
  const parts = shorthand.trim().split(/\s+/).filter(Boolean);
  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;
  if (parts.length === 1) {
    top = right = bottom = left = px(parts[0]);
  } else if (parts.length === 2) {
    top = bottom = px(parts[0]);
    right = left = px(parts[1]);
  } else if (parts.length === 3) {
    top = px(parts[0]);
    right = left = px(parts[1]);
    bottom = px(parts[2]);
  } else if (parts.length >= 4) {
    top = px(parts[0]);
    right = px(parts[1]);
    bottom = px(parts[2]);
    left = px(parts[3]);
  }
  if (style["padding-top"]) top = px(style["padding-top"], top);
  if (style["padding-right"]) right = px(style["padding-right"], right);
  if (style["padding-bottom"]) bottom = px(style["padding-bottom"], bottom);
  if (style["padding-left"]) left = px(style["padding-left"], left);
  return { top, right, bottom, left };
}

function plainText(el: HTMLElement) {
  return (el.innerHTML || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\r\n|\r/g, "\n")
    .trim();
}

function estimateTextHeight(text: string, fontSize: number, width: number) {
  const lines = text.split("\n");
  let total = 0;
  const avgChar = fontSize * 0.52;
  for (const line of lines) {
    const wrapped = Math.max(1, Math.ceil(Math.max(line.length, 1) * avgChar / Math.max(width, 40)));
    total += wrapped * fontSize * 1.35;
  }
  return Math.max(fontSize * 1.35, total);
}

function textPropsFromStyle(style: Record<string, string>) {
  const weight = (style["font-weight"] ?? "normal").toLowerCase();
  const bold =
    weight === "bold" ||
    weight === "bolder" ||
    (Number.isFinite(Number(weight)) && Number(weight) >= 600);
  const italic = (style["font-style"] ?? "").toLowerCase() === "italic";
  const deco = (style["text-decoration"] ?? "").toLowerCase();
  const underline = deco.includes("underline");
  const alignRaw = (style["text-align"] ?? "left").toLowerCase();
  const textAlign =
    alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
  const opacity =
    style.opacity != null && Number.isFinite(Number.parseFloat(style.opacity))
      ? Number.parseFloat(style.opacity)
      : 1;

  let shadow: Shadow | undefined;
  const ts = style["text-shadow"];
  if (ts) {
    // e.g. 2px 2px 4px #000 or 2px 2px 4px rgba(0,0,0,0.35)
    const m =
      /(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+(.+)/i.exec(ts.trim()) ||
      /(-?[\d.]+)px\s+(-?[\d.]+)px\s+(.+)/i.exec(ts.trim());
    if (m) {
      shadow = new Shadow({
        offsetX: Number.parseFloat(m[1]),
        offsetY: Number.parseFloat(m[2]),
        blur: m[4] ? Number.parseFloat(m[3]) : 0,
        color: (m[4] ?? m[3]).trim(),
      });
    }
  }

  return {
    fontWeight: (bold ? "bold" : "normal") as "bold" | "normal",
    fontStyle: (italic ? "italic" : "normal") as "italic" | "normal",
    underline,
    textAlign: textAlign as "left" | "center" | "right",
    opacity,
    shadow,
  };
}

function readFrame(style: Record<string, string>): ImportedFrame | undefined {
  const radiusRaw = style["border-radius"] ?? "";
  const radius = /%/i.test(radiusRaw) ? 0 : px(radiusRaw);
  const border = style.border ?? "";
  const borderMatch = /^([\d.]+)px\s+\w+\s+(.+)$/i.exec(border.trim());
  const borderWidth = borderMatch ? Number.parseFloat(borderMatch[1]) : 0;
  const borderColor = borderMatch ? borderMatch[2].trim() : "#1c2420";
  if (radius <= 0 && borderWidth <= 0) return undefined;
  return {
    radius,
    borderWidth: Number.isFinite(borderWidth) ? borderWidth : 0,
    borderColor,
  };
}

function isCircleStyle(style: Record<string, string>, w: number, h: number) {
  const br = style["border-radius"] ?? "";
  if (br === "50%") return w > 0 && h > 0;
  const r = px(br);
  return w > 0 && h > 0 && r >= Math.min(w, h) / 2 - 0.5;
}

/** Outer email card: wide box with stacked sections (not a tiny decorative circle). */
function findFlowCard(doc: Document): { el: HTMLElement; width: number } | null {
  const all = Array.from(
    doc.body?.querySelectorAll<HTMLElement>(
      "table, div, td, section, article",
    ) ?? [],
  );
  let best: { el: HTMLElement; width: number; score: number } | null = null;

  for (const el of all) {
    const styleStr = styleAttr(el);
    const style = parseStyle(styleStr);
    const w = resolveCardWidth(el);
    if (w < 280) continue;

    const h = pxLength(style.height) ?? 0;
    if (isCircleStyle(style, w, h || w)) continue;

    const textBits = el.querySelectorAll("h1, h2, h3, p, span, a").length;
    const imgs = el.querySelectorAll("img").length;
    const rows = el.querySelectorAll("tr").length;
    const childBlocks = el.children.length;
    if (textBits === 0 && imgs === 0 && childBlocks < 2) continue;

    const hasBorder = Boolean(style.border || style["border-radius"]);
    const hasBg = Boolean(
      (style.background || style["background-color"]) &&
        !isTransparent(style.background || style["background-color"]),
    );
    // Prefer the innermost bordered card table over outer 100%-width wrappers
    const nestedTables = el.querySelectorAll("table").length;
    const score =
      w * 10 +
      textBits * 8_000 +
      imgs * 6_000 +
      rows * 4_000 +
      childBlocks * 3_000 +
      (hasBorder ? 40_000 : 0) +
      (hasBg ? 15_000 : 0) +
      (isRelativeEl(el) ? 5_000 : 0) -
      nestedTables * 12_000;

    if (!best || score > best.score) best = { el, width: Math.round(w), score };
  }

  return best ? { el: best.el, width: best.width } : null;
}

type StageHit = {
  el: HTMLElement;
  width: number;
  height: number;
  score: number;
};

function scoreAbsoluteStage(el: HTMLElement): StageHit | null {
  const style = parseStyle(styleAttr(el));
  let w = px(style.width);
  let h = px(style.height);
  const absKids = Array.from(el.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement && isAbsoluteEl(c),
  ).length;
  if (absKids === 0) return null;

  if ((w < 80 || h < 80) && absKids > 0) {
    let maxR = 0;
    let maxB = 0;
    for (const child of Array.from(el.children) as HTMLElement[]) {
      if (!isAbsoluteEl(child)) continue;
      const cs = parseStyle(styleAttr(child));
      const left = px(cs.left);
      const top = px(cs.top);
      const cw = px(cs.width, child.tagName === "IMG" ? Number(child.getAttribute("width") || 0) : 0);
      const ch = px(cs.height, child.tagName === "IMG" ? Number(child.getAttribute("height") || 0) : 0);
      maxR = Math.max(maxR, left + Math.max(cw, 40));
      maxB = Math.max(maxB, top + Math.max(ch, 40));
    }
    if (w < 80) w = Math.max(maxR + 16, DESIGN_WIDTH);
    if (h < 80) h = Math.max(maxB + 16, DESIGN_HEIGHT);
  }
  if (w < 80 || h < 80) return null;
  return {
    el,
    width: Math.round(w),
    height: Math.round(h),
    score: w * h + absKids * 50_000 + (isRelativeEl(el) ? 20_000 : 0),
  };
}

function findAbsoluteStage(doc: Document): StageHit | null {
  const all = Array.from(doc.body?.querySelectorAll<HTMLElement>("*") ?? []);
  let best: StageHit | null = null;
  for (const el of all) {
    const hit = scoreAbsoluteStage(el);
    if (!hit) continue;
    if (!best || hit.score > best.score) best = hit;
  }
  return best;
}

function collectLooseAbsolute(doc: Document): HTMLElement[] {
  return Array.from(doc.body?.querySelectorAll<HTMLElement>("*") ?? []).filter(
    (el) => isAbsoluteEl(el) && !el.closest("svg"),
  );
}

function boundsOfAbsolute(els: HTMLElement[]) {
  let maxR = 0;
  let maxB = 0;
  for (const el of els) {
    const s = parseStyle(styleAttr(el));
    const left = px(s.left);
    const top = px(s.top);
    const w = px(s.width, el.tagName === "IMG" ? Number(el.getAttribute("width") || 120) : 80);
    const h = px(s.height, el.tagName === "IMG" ? Number(el.getAttribute("height") || 120) : 80);
    maxR = Math.max(maxR, left + w);
    maxB = Math.max(maxB, top + h);
  }
  return {
    width: Math.max(DESIGN_WIDTH, Math.ceil(maxR + 24)),
    height: Math.max(DESIGN_HEIGHT, Math.ceil(maxB + 24)),
  };
}

/** Best-effort: designer absolute export OR normal flow email cards. */
export async function importEmailHtmlToCanvas(
  canvas: Canvas,
  html: string,
): Promise<ImportHtmlResult> {
  const warnings: string[] = [];
  const trimmed = html.trim();
  if (!trimmed) {
    return { objectCount: 0, warnings: ["No HTML to import."] };
  }

  const doc = new DOMParser().parseFromString(trimmed, "text/html");

  // 1) Designer-style absolute layers
  const absStage = findAbsoluteStage(doc);
  if (absStage) {
    return importAbsoluteStage(canvas, absStage, warnings);
  }

  // 2) Normal flow email card (header / body / footer)
  const flow = findFlowCard(doc);
  if (flow) {
    return importFlowCard(canvas, flow.el, flow.width, warnings);
  }

  // 3) Loose absolute elements
  const loose = collectLooseAbsolute(doc);
  if (loose.length) {
    const size = boundsOfAbsolute(loose);
    let objectCount = 0;
    for (const el of loose) {
      try {
        objectCount += await importAbsoluteNode(canvas, el);
      } catch {
        warnings.push(`Skipped a layer (${el.tagName.toLowerCase()}).`);
      }
    }
    warnings.push("Imported absolute layers without a stage box.");
    return { objectCount, width: size.width, height: size.height, warnings };
  }

  // 4) Single image
  const imgs = Array.from(doc.querySelectorAll("img"));
  if (imgs.length === 1) {
    const src = imgs[0].getAttribute("src") ?? "";
    if (src) {
      const fabricImg = await FabricImage.fromURL(src, { crossOrigin: "anonymous" });
      const natW = fabricImg.width || DESIGN_WIDTH;
      const natH = fabricImg.height || DESIGN_HEIGHT;
      const scale = Math.min(1, DESIGN_WIDTH / natW);
      fabricImg.set({
        left: 0,
        top: 0,
        scaleX: scale,
        scaleY: scale,
        originX: "left",
        originY: "top",
      });
      canvas.add(fabricImg);
      warnings.push("Imported as a single image.");
      return {
        objectCount: 1,
        width: Math.round(natW * scale),
        height: Math.round(natH * scale),
        warnings,
      };
    }
  }

  warnings.push(
    "Couldn’t import this HTML into shapes. Use a designer export, or a simple card layout (stacked header/body/footer).",
  );
  return { objectCount: 0, warnings };
}

async function importAbsoluteStage(
  canvas: Canvas,
  stageHit: StageHit,
  warnings: string[],
): Promise<ImportHtmlResult> {
  const stage = stageHit.el;
  const stageStyle = parseStyle(styleAttr(stage));
  const background = stageStyle.background || stageStyle["background-color"];
  if (background && !isTransparent(background)) {
    canvas.backgroundColor = background;
  }
  const frame = readFrame(stageStyle);
  const nodes = Array.from(stage.children) as HTMLElement[];
  let objectCount = 0;
  for (const el of nodes) {
    try {
      objectCount += await importAbsoluteNode(canvas, el);
    } catch {
      warnings.push(`Skipped a layer (${el.tagName.toLowerCase()}).`);
    }
  }
  if (objectCount === 0) {
    const nested = Array.from(stage.querySelectorAll<HTMLElement>("*")).filter((el) =>
      isAbsoluteEl(el),
    );
    for (const el of nested) {
      try {
        objectCount += await importAbsoluteNode(canvas, el);
      } catch {
        /* skip */
      }
    }
  }
  if (objectCount === 0) {
    warnings.push("Absolute stage had no importable layers.");
  }
  return {
    objectCount,
    width: stageHit.width,
    height: stageHit.height,
    frame,
    background,
    warnings,
  };
}

async function importFlowCard(
  canvas: Canvas,
  root: HTMLElement,
  width: number,
  warnings: string[],
): Promise<ImportHtmlResult> {
  const style = parseStyle(styleAttr(root));
  const background = style.background || style["background-color"] || "#ffffff";
  if (background && !isTransparent(background)) {
    canvas.backgroundColor = background;
  }
  const frame = readFrame(style);
  // Use declared card width; screen frame (border/radius) is applied separately in the designer.
  const contentWidth = Math.max(200, width);

  let y = 0;
  let objectCount = 0;
  const countBefore = () => canvas.getObjects().length;

  for (const child of Array.from(root.children) as HTMLElement[]) {
    const before = countBefore();
    y = await layoutFlowBlock(canvas, child, contentWidth, 0, y);
    objectCount += countBefore() - before;
  }

  // Include root padding if any
  const rootPad = boxPadding(style);
  const height = Math.max(y + rootPad.bottom, 200);

  if (objectCount === 0) {
    warnings.push("Found a card container but couldn’t map its sections to shapes.");
  } else {
    warnings.push("Imported as a flow email card (approximate layout).");
  }

  return {
    objectCount,
    width: Math.round(width),
    height: Math.round(height),
    frame,
    background,
    warnings,
  };
}

async function layoutFlowBlock(
  canvas: Canvas,
  el: HTMLElement,
  containerWidth: number,
  x0: number,
  y0: number,
  inheritedAlign: string = "",
): Promise<number> {
  const tag = el.tagName.toLowerCase();
  if (tag === "script" || tag === "style" || tag === "br") return y0;

  const styleStr = styleAttr(el);
  const style = parseStyle(styleStr);
  const margins = boxMargins(style, styleStr);
  const padding = boxPadding(style);
  const ownAlign = (style["text-align"] ?? "").toLowerCase();
  const attrAlign = (el.getAttribute("align") ?? "").toLowerCase();
  const align =
    ownAlign === "center" || ownAlign === "right" || ownAlign === "left"
      ? ownAlign
      : attrAlign === "center" || attrAlign === "right" || attrAlign === "left"
        ? attrAlign
        : inheritedAlign === "center" ||
            inheritedAlign === "right" ||
            inheritedAlign === "left"
          ? inheritedAlign
          : "";

  let y = y0 + margins.top;

  // Decorative fixed-size circle / ellipse (no meaningful children)
  const boxW = pxLength(style.width) ?? 0;
  const boxH = pxLength(style.height) ?? 0;
  const fill = style.background || style["background-color"] || "";
  const hasElementChildren = el.children.length > 0;

  // Table structure: walk rows / cells in document order
  if (
    tag === "table" ||
    tag === "tbody" ||
    tag === "thead" ||
    tag === "tfoot" ||
    tag === "tr"
  ) {
    let yCursor = y;
    for (const child of Array.from(el.children) as HTMLElement[]) {
      yCursor = await layoutFlowBlock(
        canvas,
        child,
        containerWidth,
        x0,
        yCursor,
        align,
      );
    }
    return yCursor + margins.bottom;
  }

  if (
    boxW > 0 &&
    boxH > 0 &&
    isCircleStyle(style, boxW, boxH) &&
    el.children.length === 0 &&
    !plainText(el)
  ) {
    const left = margins.centerX || align === "center" ? x0 + (containerWidth - boxW) / 2 : x0 + margins.left;
    if (Math.abs(boxW - boxH) < 1) {
      canvas.add(
        new Circle({
          left,
          top: y,
          radius: boxW / 2,
          fill: isTransparent(fill) ? "#0f6b5c" : fill,
          originX: "left",
          originY: "top",
        }),
      );
    } else {
      canvas.add(
        new Ellipse({
          left,
          top: y,
          rx: boxW / 2,
          ry: boxH / 2,
          fill: isTransparent(fill) ? "#0f6b5c" : fill,
          originX: "left",
          originY: "top",
        }),
      );
    }
    return y + boxH + margins.bottom;
  }

  // Button-like link
  if (tag === "a") {
    const text = plainText(el);
    if (!text) return y + margins.bottom;
    const fontSize = px(style["font-size"], 16);
    const color = style.color || "#ffffff";
    const fontFamily = (style["font-family"] || "Segoe UI")
      .replace(/['"]/g, "")
      .split(",")[0]
      .trim();
    const props = textPropsFromStyle(style);
    const pad = boxPadding(style);
    const hasBtnBg = !isTransparent(fill);
    const textW = Math.min(
      containerWidth - margins.left - margins.right,
      Math.max(80, text.length * fontSize * 0.55 + pad.left + pad.right),
    );
    const textH = fontSize * 1.35 + pad.top + pad.bottom;
    const left =
      margins.centerX || align === "center"
        ? x0 + (containerWidth - textW) / 2
        : x0 + margins.left;

    if (hasBtnBg) {
      const radius = /%/i.test(style["border-radius"] ?? "")
        ? 0
        : px(style["border-radius"]);
      canvas.add(
        new Rect({
          left,
          top: y,
          width: textW,
          height: textH,
          fill,
          rx: radius,
          ry: radius,
          originX: "left",
          originY: "top",
        }),
      );
      canvas.add(
        new Textbox(text, {
          left: left + pad.left,
          top: y + pad.top,
          width: Math.max(40, textW - pad.left - pad.right),
          fontSize,
          fill: color,
          fontFamily,
          textAlign: "center",
          fontWeight: props.fontWeight,
          fontStyle: props.fontStyle,
          underline: props.underline,
          originX: "left",
          originY: "top",
        }),
      );
      return y + textH + margins.bottom;
    }

    canvas.add(
      new Textbox(text, {
        left: x0 + margins.left,
        top: y,
        width: Math.max(40, containerWidth - margins.left - margins.right),
        fontSize,
        fill: color === "#ffffff" ? "#0f6b5c" : color,
        fontFamily,
        ...props,
        underline: true,
        originX: "left",
        originY: "top",
      }),
    );
    return y + fontSize * 1.5 + margins.bottom;
  }

  // Text elements — flatten unless they wrap a button/image
  if (/^(h1|h2|h3|h4|p|span|strong|em|label)$/i.test(tag)) {
    const rich = Array.from(el.children).some(
      (c) =>
        c instanceof HTMLElement &&
        (c.tagName === "A" || c.tagName === "IMG" || c.tagName === "TABLE"),
    );
    if (rich) {
      let yCursor = y;
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = (child.textContent ?? "").replace(/\s+/g, " ").trim();
          if (!t) continue;
          const fontSize = px(style["font-size"], 16);
          const height = estimateTextHeight(t, fontSize, containerWidth);
          const props = textPropsFromStyle(style);
          if (align === "center" || align === "right" || align === "left") {
            props.textAlign = align;
          }
          canvas.add(
            new Textbox(t, {
              left: x0 + margins.left,
              top: yCursor,
              width: Math.max(40, containerWidth - margins.left - margins.right),
              fontSize,
              fill: style.color || "#1c2420",
              fontFamily: (style["font-family"] || "Segoe UI")
                .replace(/['"]/g, "")
                .split(",")[0]
                .trim(),
              ...props,
              originX: "left",
              originY: "top",
            }),
          );
          yCursor += height;
        } else if (child instanceof HTMLElement) {
          yCursor = await layoutFlowBlock(
            canvas,
            child,
            containerWidth,
            x0,
            yCursor,
            align,
          );
        }
      }
      return yCursor + margins.bottom;
    }

    const text = plainText(el);
    if (!text) return y + margins.bottom;
    const fontSize =
      px(style["font-size"]) ||
      (tag === "h1" ? 28 : tag === "h2" ? 24 : tag === "h3" ? 20 : 16);
    const color = style.color || "#1c2420";
    const fontFamily = (style["font-family"] || "Segoe UI")
      .replace(/['"]/g, "")
      .split(",")[0]
      .trim();
    const props = textPropsFromStyle(style);
    if (tag === "strong" || tag === "b") props.fontWeight = "bold";
    if (tag === "em" || tag === "i") props.fontStyle = "italic";
    if (align === "center" || align === "right" || align === "left") {
      props.textAlign = align;
    }
    const width = Math.max(40, containerWidth - margins.left - margins.right);
    const height = estimateTextHeight(text, fontSize, width);
    canvas.add(
      new Textbox(text, {
        left: x0 + margins.left,
        top: y,
        width,
        fontSize,
        fill: color,
        fontFamily,
        ...props,
        originX: "left",
        originY: "top",
      }),
    );
    return y + height + margins.bottom;
  }

  if (tag === "img") {
    const src = el.getAttribute("src") ?? "";
    if (!src) return y + margins.bottom;
    const attrW = Number(el.getAttribute("width") || 0);
    const attrH = Number(el.getAttribute("height") || 0);
    let w = (boxW > 0 ? boxW : 0) || attrW || 0;
    let h = (boxH > 0 ? boxH : 0) || attrH || 0;
    let fabricImg: FabricImage;
    try {
      fabricImg = await FabricImage.fromURL(src, { crossOrigin: "anonymous" });
    } catch {
      return y + margins.bottom;
    }
    const natW = fabricImg.width || w || 200;
    const natH = fabricImg.height || h || 200;
    if (!w) w = Math.min(containerWidth, natW);
    if (!h) h = Math.round(w * (natH / Math.max(natW, 1)));
    w = Math.min(w, containerWidth);
    const scaleX = w / natW;
    const scaleY = h / natH;
    const left =
      margins.centerX || align === "center"
        ? x0 + (containerWidth - w) / 2
        : x0 + margins.left;
    fabricImg.set({
      left,
      top: y,
      scaleX,
      scaleY,
      originX: "left",
      originY: "top",
    });
    canvas.add(fabricImg);
    return y + h + margins.bottom;
  }

  // Section / wrapper div / table cell
  if (
    tag === "div" ||
    tag === "section" ||
    tag === "header" ||
    tag === "footer" ||
    tag === "td" ||
    tag === "th"
  ) {
    const innerWidth = Math.max(
      40,
      containerWidth - margins.left - margins.right,
    );
    const contentWidth = Math.max(40, innerWidth - padding.left - padding.right);
    const sectionX = x0 + margins.left;
    const contentX = sectionX + padding.left;
    let contentY = y + padding.top;
    const startContentY = contentY;

    if (hasElementChildren) {
      for (const child of Array.from(el.children) as HTMLElement[]) {
        contentY = await layoutFlowBlock(
          canvas,
          child,
          contentWidth,
          contentX,
          contentY,
          align,
        );
      }
    } else {
      const text = plainText(el);
      if (text) {
        const fontSize = px(style["font-size"], 16);
        const color = style.color || "#1c2420";
        const height = estimateTextHeight(text, fontSize, contentWidth);
        const props = textPropsFromStyle(style);
        if (align === "center" || align === "right" || align === "left") {
          props.textAlign = align;
        }
        canvas.add(
          new Textbox(text, {
            left: contentX,
            top: contentY,
            width: contentWidth,
            fontSize,
            fill: color,
            fontFamily: (style["font-family"] || "Segoe UI")
              .replace(/['"]/g, "")
              .split(",")[0]
              .trim(),
            ...props,
            originX: "left",
            originY: "top",
          }),
        );
        contentY += height;
      }
    }

    const contentHeight = Math.max(0, contentY - startContentY);
    const sectionHeight = Math.max(
      boxH,
      padding.top + contentHeight + padding.bottom,
    );

    if (!isTransparent(fill) && sectionHeight > 0) {
      const rect = new Rect({
        left: sectionX,
        top: y,
        width: innerWidth,
        height: sectionHeight,
        fill,
        rx: /%/i.test(style["border-radius"] ?? "") ? 0 : px(style["border-radius"]),
        ry: /%/i.test(style["border-radius"] ?? "") ? 0 : px(style["border-radius"]),
        originX: "left",
        originY: "top",
      });
      canvas.add(rect);
      canvas.sendObjectToBack(rect);
    }

    return y + sectionHeight + margins.bottom;
  }

  // Unknown wrapper: still try children
  let yCursor = y;
  for (const child of Array.from(el.children) as HTMLElement[]) {
    yCursor = await layoutFlowBlock(
      canvas,
      child,
      containerWidth,
      x0,
      yCursor,
      align,
    );
  }
  return Math.max(yCursor, y) + margins.bottom;
}

async function importAbsoluteNode(canvas: Canvas, el: HTMLElement): Promise<number> {
  const tag = el.tagName.toLowerCase();
  const style = parseStyle(styleAttr(el));
  const left = px(style.left);
  const top = px(style.top);
  const angle = angleFromTransform(style.transform);
  const opacity = style.opacity != null ? Number.parseFloat(style.opacity) : 1;

  if (tag === "img") {
    const src = el.getAttribute("src") ?? "";
    if (!src) return 0;
    const w = px(style.width, Number(el.getAttribute("width") || 0) || 200);
    const h = px(style.height, Number(el.getAttribute("height") || 0) || 200);
    const fabricImg = await FabricImage.fromURL(src, { crossOrigin: "anonymous" });
    const scaleX = w / (fabricImg.width || w || 1);
    const scaleY = h / (fabricImg.height || h || 1);
    fabricImg.set({
      left,
      top,
      scaleX,
      scaleY,
      angle,
      opacity: Number.isFinite(opacity) ? opacity : 1,
      originX: "left",
      originY: "top",
    });
    canvas.add(fabricImg);
    return 1;
  }

  if (tag === "svg") {
    const polygon = el.querySelector("polygon, polyline");
    if (polygon) {
      const raw = polygon.getAttribute("points") ?? "";
      const points = raw
        .trim()
        .split(/\s+/)
        .map((pair) => {
          const [x, y] = pair.split(",").map(Number);
          return { x: x || 0, y: y || 0 };
        })
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!points.length) return 0;
      const fill = polygon.getAttribute("fill") || "transparent";
      const stroke = polygon.getAttribute("stroke") || "transparent";
      const strokeWidth = Number(polygon.getAttribute("stroke-width") || 0);
      canvas.add(
        new Polygon(points, {
          left,
          top,
          fill: isTransparent(fill) ? "transparent" : fill,
          stroke: isTransparent(stroke) ? undefined : stroke,
          strokeWidth,
          angle,
          opacity: Number.isFinite(opacity) ? opacity : 1,
          originX: "left",
          originY: "top",
        }),
      );
      return 1;
    }
    const line = el.querySelector("line");
    if (line) {
      const x1 = Number(line.getAttribute("x1") || 0);
      const y1 = Number(line.getAttribute("y1") || 0);
      const x2 = Number(line.getAttribute("x2") || 0);
      const y2 = Number(line.getAttribute("y2") || 0);
      canvas.add(
        new Line([left + x1, top + y1, left + x2, top + y2], {
          stroke: line.getAttribute("stroke") || "#1c2420",
          strokeWidth: Number(line.getAttribute("stroke-width") || 2),
          angle,
          opacity: Number.isFinite(opacity) ? opacity : 1,
        }),
      );
      return 1;
    }
    return 0;
  }

  if (tag !== "div") return 0;

  const w = px(style.width);
  const h = px(style.height);
  const fill = style.background || style["background-color"] || "transparent";
  const border = style.border ?? "";
  const borderMatch = /^([\d.]+)px\s+(\w+)\s+(.+)$/i.exec(border.trim());
  const strokeWidth = borderMatch ? Number.parseFloat(borderMatch[1]) : 0;
  const stroke = borderMatch ? borderMatch[3].trim() : "transparent";
  const radius = px(style["border-radius"]);
  const fontSize = px(style["font-size"], 0);
  const text = plainText(el);

  if (fontSize > 0 || (text && isTransparent(fill))) {
    const props = textPropsFromStyle(style);
    canvas.add(
      new Textbox(text || " ", {
        left,
        top,
        width: Math.max(40, w || 160),
        fontSize: fontSize || 22,
        fill: style.color || "#1c2420",
        fontFamily: (style["font-family"] || "Segoe UI")
          .replace(/['"]/g, "")
          .split(",")[0]
          .trim(),
        angle,
        ...props,
        opacity: Number.isFinite(opacity) ? opacity : props.opacity,
        originX: "left",
        originY: "top",
      }),
    );
    return 1;
  }

  if (isCircleStyle(style, w, h)) {
    if (Math.abs(w - h) < 1) {
      canvas.add(
        new Circle({
          left,
          top,
          radius: Math.max(1, w / 2),
          fill: isTransparent(fill) ? "transparent" : fill,
          stroke: strokeWidth ? stroke : undefined,
          strokeWidth: strokeWidth || 0,
          angle,
          opacity: Number.isFinite(opacity) ? opacity : 1,
          originX: "left",
          originY: "top",
        }),
      );
      return 1;
    }
    canvas.add(
      new Ellipse({
        left,
        top,
        rx: Math.max(1, w / 2),
        ry: Math.max(1, h / 2),
        fill: isTransparent(fill) ? "transparent" : fill,
        stroke: strokeWidth ? stroke : undefined,
        strokeWidth: strokeWidth || 0,
        angle,
        opacity: Number.isFinite(opacity) ? opacity : 1,
        originX: "left",
        originY: "top",
      }),
    );
    return 1;
  }

  if (w > 0 && h > 0) {
    canvas.add(
      new Rect({
        left,
        top,
        width: w,
        height: h,
        fill: isTransparent(fill) ? "transparent" : fill,
        stroke: strokeWidth ? stroke : undefined,
        strokeWidth: strokeWidth || 0,
        rx: radius,
        ry: radius,
        angle,
        opacity: Number.isFinite(opacity) ? opacity : 1,
        originX: "left",
        originY: "top",
      }),
    );
    return 1;
  }

  return 0;
}
