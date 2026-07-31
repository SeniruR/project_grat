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
        map[ph.key] = name;
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

  map.name = name;
  map.displayName = name;
  map.recipientName = name;
  map.email = input.recipient.email;
  map.recipientEmail = input.recipient.email;
  map.senderName = senderName;
  map.senderEmail = input.sender.email;

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

  return applyMergeFields(
    wrapped,
    buildMergeFieldMap({
      placeholders: input.placeholders,
      recipient: input.recipient,
      sender: input.sender,
      shared: input.shared,
      perRecipient: input.perRecipient,
    }),
  );
}
