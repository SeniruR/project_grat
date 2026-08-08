/** Shared email HTML helpers (Canva / image import / preview / compose). */

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
