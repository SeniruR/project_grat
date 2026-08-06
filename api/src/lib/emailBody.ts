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

export function wrapWithHeaderFooter(
  bodyHtml: string,
  headerHtml?: string | null,
  footerHtml?: string | null,
) {
  const body = extractEmailBodyHtml(bodyHtml);
  return `${headerHtml?.trim() ?? ""}${body}${footerHtml?.trim() ?? ""}`;
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

function recipientNameValueForKey(key: string, fullName: string): string {
  const name = fullName.trim();
  if (!name) return "";
  const k = key.toLowerCase().replace(/[_.-]/g, "");
  if (k === "firstname" || k === "fname") {
    return name.split(/\s+/)[0] ?? name;
  }
  return name;
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
      case "shared":
        map[ph.key] = (shared[ph.key] ?? "").trim();
        break;
      case "perRecipient":
        map[ph.key] = (perRecipient[ph.key] ?? "").trim();
        break;
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

  return applyImageSlotOverrides(
    merged,
    input.imageOverrides ?? {},
    input.imageSlots ?? parseImageSlotsFromDesignJson(null),
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
