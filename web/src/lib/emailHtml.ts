/** Shared email HTML helpers (Canva / image import / preview / compose). */

/**
 * Near-white paper. Pure #ffffff is inverted to black in Outlook / Chrome
 * dark mode; #fffffe is kept as designed.
 */
export const EMAIL_PAPER_BG = "#fffffe";

/** Head tags so clients and preview iframes do not apply a dark color scheme. */
export const EMAIL_LIGHT_SCHEME_HEAD = `<meta name="color-scheme" content="light only" /><meta name="supported-color-schemes" content="light" />`;

/** Ink that Gmail dark mode will not invert to white. Pure #000000 is flipped. */
export const EMAIL_INK = "#000001";

export function emailLightSchemeCss(bg = EMAIL_PAPER_BG) {
  return `html, body { color-scheme: only light !important; background: ${bg} !important; margin: 0 !important; padding: 0 !important; width: 100% !important; overflow: hidden !important; }
:root { color-scheme: only light; supported-color-schemes: light; }
u + .body { background: ${bg} !important; }`;
}

function guessEmailWidth(html: string, fallback = 600) {
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

function guessEmailHeight(html: string) {
  let max = 0;
  const slice = html.slice(0, 80_000);
  for (const m of slice.matchAll(/height:\s*(\d+)px/gi)) {
    const h = Number(m[1]);
    if (Number.isFinite(h) && h >= 200 && h <= 8000) max = Math.max(max, h);
  }
  return max;
}

function parseCssPx(value: string | undefined) {
  if (!value) return null;
  const m = /^(-?[\d.]+)px$/i.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseStyleMap(style: string) {
  const map = new Map<string, string>();
  for (const part of style.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).trim();
    if (k) map.set(k, v);
  }
  return map;
}

function serializeStyleMap(map: Map<string, string>) {
  return [...map.entries()].map(([k, v]) => `${k}:${v}`).join(";");
}

function rewritePaperColors(html: string) {
  let out = html;
  out = out.replace(
    /rgba?\(\s*0\s*,\s*0\s*,\s*0(?:\s*,\s*[\d.]+\s*)?\)/gi,
    EMAIL_INK,
  );
  out = out.replace(
    /rgba?\(\s*255\s*,\s*255\s*,\s*255(?:\s*,\s*[\d.]+\s*)?\)/gi,
    EMAIL_PAPER_BG,
  );
  out = out.replace(/#000000\b/gi, EMAIL_INK);
  out = out.replace(/#000\b/gi, EMAIL_INK);
  out = out.replace(/#ffffff\b/gi, EMAIL_PAPER_BG);
  out = out.replace(/#fff\b/gi, EMAIL_PAPER_BG);
  out = out.replace(/style=(["'])([\s\S]*?)\1/gi, (_full, q: string, style: string) => {
    let next = style;
    if (/\bcolor\s*:\s*black\b/i.test(next)) {
      next = next.replace(/\bcolor\s*:\s*black\b/gi, `color:${EMAIL_INK}`);
    }
    if (/\bbackground(?:-color)?\s*:\s*white\b/i.test(next)) {
      next = next.replace(
        /\bbackground(?:-color)?\s*:\s*white\b/gi,
        `background-color:${EMAIL_PAPER_BG}`,
      );
    }
    if (
      /\bposition\s*:\s*relative\b/i.test(next) &&
      !/\boverflow\s*:/i.test(next)
    ) {
      next = `${next.replace(/;?\s*$/, "")};overflow:hidden`;
    }
    return `style=${q}${next}${q}`;
  });
  return out;
}

/**
 * Gmail ignores overflow:hidden, so hanging Canva imgs leak into the
 * message chrome. Shrink each absolute image box to the artboard and
 * object-position the bitmap so the visible slice stays put.
 */
function clipAbsoluteImagesToCanvas(
  html: string,
  canvasW: number,
  canvasH: number,
) {
  return html.replace(/<img\b([^>]*?)\/?>/gi, (full, rawAttrs: string) => {
    const attrs = rawAttrs.replace(/\/\s*$/, "");
    const styleM = /style=(["'])([\s\S]*?)\1/i.exec(attrs);
    if (!styleM) return full;
    const map = parseStyleMap(styleM[2]);
    if (!/absolute/i.test(map.get("position") ?? "")) return full;
    const left = parseCssPx(map.get("left"));
    const top = parseCssPx(map.get("top"));
    const width = parseCssPx(map.get("width"));
    const height = parseCssPx(map.get("height"));
    if (width == null || height == null) return full;

    let x = left ?? 0;
    let y = top ?? 0;
    let w = width;
    let h = height;
    let posX = 50;
    let posY = 50;
    let cropped = false;

    if (x < 0) {
      w += x;
      x = 0;
      posX = 100;
      cropped = true;
    }
    if (y < 0) {
      h += y;
      y = 0;
      posY = 100;
      cropped = true;
    }
    if (x + w > canvasW) {
      w = canvasW - x;
      posX = 0;
      cropped = true;
    }
    if (canvasH > 0 && y + h > canvasH) {
      h = canvasH - y;
      posY = 0;
      cropped = true;
    }
    if (w < 1 || h < 1) return "";
    if (!cropped) return full;

    map.set("left", `${Math.round(x)}px`);
    map.set("top", `${Math.round(y)}px`);
    map.set("width", `${Math.round(w)}px`);
    map.set("height", `${Math.round(h)}px`);
    map.set("object-fit", "cover");
    map.set("object-position", `${posX}% ${posY}%`);
    const nextStyle = serializeStyleMap(map);
    const nextAttrs = attrs.replace(
      /style=(["'])([\s\S]*?)\1/i,
      `style="${nextStyle}"`,
    );
    return `<img${nextAttrs}>`;
  });
}

/**
 * Center the card in the message pane (Gmail/Outlook): 100% outer table,
 * inner table at the design width. A body locked to Npx sits on the left.
 */
export function hardenEmailAgainstDarkMode(html: string) {
  const colored = rewritePaperColors(html.trim());
  if (!colored) return colored;
  if (/data-grat-center/i.test(colored)) return colored;

  const w = guessEmailWidth(colored);
  const h = guessEmailHeight(colored);
  const head = extractEmailHeadInner(colored);
  const card = clipAbsoluteImagesToCanvas(
    extractEmailBodyHtml(colored),
    w,
    h,
  );
  const innerH =
    h > 0
      ? `height:${h}px;max-height:${h}px;overflow:hidden;`
      : `overflow:hidden;`;

  return `<!DOCTYPE html>
<html lang="en" data-grat-shell="1">
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="x-apple-disable-message-reformatting"/>
${EMAIL_LIGHT_SCHEME_HEAD}
${head}
<style data-grat-color-scheme>
  ${emailLightSchemeCss()}
  img { display: block; border: 0; }
  table { border-collapse: collapse; }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background:${EMAIL_PAPER_BG};" bgcolor="${EMAIL_PAPER_BG}">
<table data-grat-center role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_PAPER_BG}" style="width:100%;border-collapse:collapse;background-color:${EMAIL_PAPER_BG};">
<tr>
<td align="center" valign="top" style="padding:0;margin:0;">
<table role="presentation" width="${w}" cellpadding="0" cellspacing="0" border="0" style="width:${w}px;max-width:100%;margin:0 auto;border-collapse:collapse;">
<tr>
<td align="center" valign="top" style="padding:0;margin:0;${innerH}">
${card}
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

/** Insert light-scheme meta + CSS so OS dark mode cannot restyle the card. */
export function ensureEmailLightColorScheme(html: string) {
  return hardenEmailAgainstDarkMode(html.trim());
}

/** Legacy single-image email body for image_import cards. */
export function buildCompiledEmailHtml(input: {
  imageUrl: string;
  width: number;
  alt?: string;
}) {
  const img = `<img src="${input.imageUrl}" width="${input.width}" alt="${escapeAttr(input.alt ?? "Gratitude card")}" style="display:block;border:0;outline:none;text-decoration:none;width:100%;max-width:${input.width}px;height:auto;" />`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;max-width:${input.width}px;margin:0 auto;"><tr><td style="padding:0;">${img}</td></tr></table>`;
}

/** True when HTML is already a full document (has doctype or <html>). */
export function isFullHtmlDocument(html: string) {
  return /^\s*<!DOCTYPE\s+html/i.test(html) || /^\s*<html[\s>]/i.test(html);
}

/** Body inner HTML only - safe to wrap with header/footer or inject into a shell. */
export function extractEmailBodyHtml(html: string) {
  const t = html.trim();
  if (!t) return "";
  if (!isFullHtmlDocument(t)) return t;
  const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(t);
  return m ? m[1].trim() : t;
}

/**
 * Inner HTML of <head> (styles, font links, @font-face).
 * Needed for Canva imports - fonts live in head, not on every text node.
 */
export function extractEmailHeadInner(html: string) {
  const t = html.trim();
  if (!t || !isFullHtmlDocument(t)) return "";
  const m = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(t);
  if (!m) return "";
  return m[1]
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "")
    .trim();
}

/** Apply optional org header/footer around a stored card body. */
export function wrapWithHeaderFooter(
  bodyHtml: string,
  headerHtml?: string | null,
  footerHtml?: string | null,
) {
  const header = headerHtml?.trim() ?? "";
  const footer = footerHtml?.trim() ?? "";
  // Keep full documents (Canva head/fonts) intact when there is nothing to wrap.
  if (!header && !footer) return bodyHtml;

  if (isFullHtmlDocument(bodyHtml)) {
    let out = bodyHtml;
    if (header) {
      out = out.replace(/<body([^>]*)>/i, `<body$1>${header}`);
    }
    if (footer) {
      out = /<\/body>/i.test(out)
        ? out.replace(/<\/body>/i, `${footer}</body>`)
        : `${out}${footer}`;
    }
    return out;
  }

  const body = extractEmailBodyHtml(bodyHtml);
  return `${header}${body}${footer}`;
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
