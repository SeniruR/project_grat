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

export function buildMergeFieldMap(input: {
  recipient: { displayName?: string | null; email: string };
  sender: { displayName?: string | null; email: string };
}): Record<string, string> {
  const name = input.recipient.displayName?.trim() || input.recipient.email;
  const senderName = input.sender.displayName?.trim() || input.sender.email;
  return {
    name,
    displayName: name,
    recipientName: name,
    email: input.recipient.email,
    recipientEmail: input.recipient.email,
    senderName,
    senderEmail: input.sender.email,
  };
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
      recipient: input.recipient,
      sender: input.sender,
    }),
  );
}
