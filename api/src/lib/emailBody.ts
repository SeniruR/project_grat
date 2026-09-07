import { resolveHtmlImageSrcs, type AssetRef } from "./htmlAssets.js";

function isFullHtmlDocument(html: string) {
  return /^\s*<!DOCTYPE\s+html/i.test(html) || /^\s*<html[\s>]/i.test(html);
}

function extractEmailBodyHtml(html: string) {
  const t = html.trim();
  if (!t) return "";
  if (!isFullHtmlDocument(t)) return t;
  const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(t);
  return m ? m[1].trim() : t;
}

function extractEmailHeadInner(html: string) {
  const t = html.trim();
  if (!t || !isFullHtmlDocument(t)) return "";
  const m = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(t);
  if (!m) return "";
  return m[1]
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "")
    .trim();
}

const EMAIL_PAPER_BG = "#fffffe";
const EMAIL_INK = "#000001";

function emailLightSchemeCss() {
  return `html, body { color-scheme: only light !important; background: ${EMAIL_PAPER_BG} !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
:root { color-scheme: only light; supported-color-schemes: light; }
u + .body { background: ${EMAIL_PAPER_BG} !important; }`;
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

/** Center the card in Gmail/Outlook: 100% outer table, inner table at design width. */
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
<meta name="color-scheme" content="light only"/>
<meta name="supported-color-schemes" content="light"/>
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

export function wrapWithHeaderFooter(
  bodyHtml: string,
  headerHtml?: string | null,
  footerHtml?: string | null,
) {
  const header = headerHtml?.trim() ?? "";
  const footer = footerHtml?.trim() ?? "";
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

/** Replace {{field}} tokens (case-insensitive keys). Unknown tokens left as-is. */
export function applyMergeFields(
  html: string,
  fields: Record<string, string>,
) {
  const map = new Map(
    Object.entries(fields).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return html.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (full, key: string) => {
    const value = map.get(key.toLowerCase());
    return value != null ? value : full;
  });
}

export type PlaceholderSource =
  | "recipientName"
  | "recipientEmail"
  | "senderName"
  | "senderEmail"
  | "shared"
  | "perRecipient";

export type PlaceholderDef = {
  key: string;
  label: string;
  source: PlaceholderSource;
};

const PLACEHOLDER_SOURCES = new Set<string>([
  "recipientName",
  "recipientEmail",
  "senderName",
  "senderEmail",
  "shared",
  "perRecipient",
]);

/** Leading title tokens (Mr., Dr., …) so firstname is not taken from the prefix. */
const HONORIFIC_PREFIX_RE =
  /^(mr|mrs|ms|miss|dr|sir|madam|mx|prof|professor)\.?$/i;

function givenNameFromDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  let i = 0;
  while (
    i < parts.length - 1 &&
    HONORIFIC_PREFIX_RE.test(parts[i].replace(/,/g, ""))
  ) {
    i += 1;
  }
  return parts[i] ?? fullName.trim();
}

function recipientNameValueForKey(key: string, fullName: string): string {
  const name = fullName.trim();
  if (!name) return "";
  const k = key.toLowerCase().replace(/[_.-]/g, "");
  // fname / fullname / recipientName stay the full titled name (Mr. Senirurandiv).
  // firstname is the given name after skipping a leading honorific.
  if (k === "firstname") {
    return givenNameFromDisplayName(name);
  }
  return name;
}

/** Tokens that mean the selected recipient's name (incl. common typos). */
export function isRecipientNameToken(key: string): boolean {
  const k = key.toLowerCase().replace(/[_.-]/g, "");
  if (
    k === "name" ||
    k === "displayname" ||
    k === "firstname" ||
    k === "fname" ||
    k === "fullname"
  ) {
    return true;
  }
  if (k.includes("recipient") && k.includes("name")) return true;
  if (
    (k.startsWith("recip") || k.startsWith("recep") || k.startsWith("reciep")) &&
    k.endsWith("name")
  ) {
    return true;
  }
  return k === "recipientname";
}

export function parsePlaceholdersFromDesignJson(
  designJson: unknown,
): PlaceholderDef[] {
  if (!designJson || typeof designJson !== "object") return [];
  const raw = (designJson as { placeholders?: unknown }).placeholders;
  if (!Array.isArray(raw)) return [];
  const out: PlaceholderDef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key.trim() : "";
    if (!key || seen.has(key.toLowerCase())) continue;
    if (typeof row.source !== "string" || !PLACEHOLDER_SOURCES.has(row.source)) {
      continue;
    }
    const label =
      typeof row.label === "string" && row.label.trim()
        ? row.label.trim()
        : key;
    seen.add(key.toLowerCase());
    out.push({
      key,
      label,
      source: row.source as PlaceholderSource,
    });
  }
  return out;
}

export function buildMergeFieldMap(input: {
  placeholders?: PlaceholderDef[];
  recipient: { displayName?: string | null; email: string };
  sender: { displayName?: string | null; email: string };
  shared?: Record<string, string>;
  perRecipient?: Record<string, string>;
}): Record<string, string> {
  const name = input.recipient.displayName?.trim() || input.recipient.email;
  const senderName = input.sender.displayName?.trim() || input.sender.email;
  const shared = input.shared ?? {};
  const perRecipient = input.perRecipient ?? {};
  const map: Record<string, string> = {};

  for (const ph of input.placeholders ?? []) {
    switch (ph.source) {
      case "recipientName":
        map[ph.key] = recipientNameValueForKey(ph.key, name);
        break;
      case "recipientEmail":
        map[ph.key] = input.recipient.email;
        break;
      case "senderName":
        map[ph.key] = senderName;
        break;
      case "senderEmail":
        map[ph.key] = input.sender.email;
        break;
      case "shared": {
        const sharedVal = (shared[ph.key] ?? "").trim();
        map[ph.key] =
          sharedVal ||
          (isRecipientNameToken(ph.key)
            ? recipientNameValueForKey(ph.key, name)
            : "");
        break;
      }
      case "perRecipient": {
        const perVal = (perRecipient[ph.key] ?? "").trim();
        map[ph.key] =
          perVal ||
          (isRecipientNameToken(ph.key)
            ? recipientNameValueForKey(ph.key, name)
            : "");
        break;
      }
    }
  }

  // Aliases only when the token was never defined on the template.
  const setAlias = (key: string, value: string) => {
    if (!(key in map)) map[key] = value;
  };
  setAlias("name", name);
  setAlias("displayName", name);
  setAlias("recipientName", name);
  setAlias("email", input.recipient.email);
  setAlias("recipientEmail", input.recipient.email);
  setAlias("senderName", senderName);
  setAlias("senderEmail", input.sender.email);

  for (const [key, value] of Object.entries(map)) {
    if (!value.trim() && isRecipientNameToken(key)) {
      map[key] = recipientNameValueForKey(key, name);
    }
  }

  return map;
}

export function buildOutboundBodyHtml(input: {
  compiledHtml: string;
  headerHtml?: string | null;
  footerHtml?: string | null;
  assets: AssetRef[];
  publicBaseUrl: string;
  recipient: {
    displayName?: string | null;
    email: string;
  };
  sender: {
    displayName?: string | null;
    email: string;
  };
  placeholders?: PlaceholderDef[];
  shared?: Record<string, string>;
  perRecipient?: Record<string, string>;
  /** slotId → absolute image URL overrides for this send */
  imageOverrides?: Record<string, string>;
  imageSlots?: ImageSlotDef[];
}) {
  const resolved = resolveHtmlImageSrcs(
    input.compiledHtml,
    input.assets,
    input.publicBaseUrl,
  );
  const wrapped = wrapWithHeaderFooter(
    resolved,
    input.headerHtml
      ? resolveHtmlImageSrcs(
          input.headerHtml,
          input.assets,
          input.publicBaseUrl,
        )
      : null,
    input.footerHtml
      ? resolveHtmlImageSrcs(
          input.footerHtml,
          input.assets,
          input.publicBaseUrl,
        )
      : null,
  );

  const merged = applyMergeFields(
    wrapped,
    buildMergeFieldMap({
      placeholders: input.placeholders,
      recipient: input.recipient,
      sender: input.sender,
      shared: input.shared,
      perRecipient: input.perRecipient,
    }),
  );

  return hardenEmailAgainstDarkMode(
    applyImageSlotOverrides(
      merged,
      input.imageOverrides ?? {},
      input.imageSlots ?? parseImageSlotsFromDesignJson(null),
    ),
  );
}

export type ImageSlotDef = {
  id: string;
  label: string;
  mode: "fixed" | "shared" | "perRecipient";
  originalSrc: string;
  designedWidth: number;
  designedHeight: number;
  borderRadius: number;
};

export function parseImageSlotsFromDesignJson(
  designJson: unknown,
): ImageSlotDef[] {
  if (!designJson || typeof designJson !== "object") return [];
  const raw = (designJson as { imageSlots?: unknown }).imageSlots;
  if (!Array.isArray(raw)) return [];
  const out: ImageSlotDef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id || seen.has(id)) continue;
    const mode = row.mode;
    if (mode !== "fixed" && mode !== "shared" && mode !== "perRecipient") {
      continue;
    }
    seen.add(id);
    out.push({
      id,
      label:
        typeof row.label === "string" && row.label.trim()
          ? row.label.trim()
          : id,
      mode,
      originalSrc:
        typeof row.originalSrc === "string" ? row.originalSrc : "",
      designedWidth:
        typeof row.designedWidth === "number" && row.designedWidth > 0
          ? Math.round(row.designedWidth)
          : 600,
      designedHeight:
        typeof row.designedHeight === "number" && row.designedHeight > 0
          ? Math.round(row.designedHeight)
          : 400,
      borderRadius:
        typeof row.borderRadius === "number" && row.borderRadius > 0
          ? Math.round(row.borderRadius)
          : 0,
    });
  }
  return out;
}

function imgAttr(attrs: string, name: string): string | null {
  const re = new RegExp(
    `\\b${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const m = re.exec(attrs);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3] ?? "").trim() || null;
}

function ensureImgBorderRadius(attrs: string, radius: number): string {
  // Keep existing radius if present; never inject a new one (avoids double-round
  // with clipped replacement PNGs).
  void radius;
  return attrs;
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

  return html.replace(/<img\b([^>]*?)>/gi, (full, attrs: string) => {
    const slotId = imgAttr(attrs, "data-grat-slot");
    const src = imgAttr(attrs, "src") ?? "";
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
    nextAttrs = ensureImgBorderRadius(nextAttrs, slot?.borderRadius ?? 0);
    return `<img${nextAttrs}>`;
  });
}
