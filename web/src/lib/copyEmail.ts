import { extractEmailBodyHtml, isFullHtmlDocument } from "../designer/compile";

function fullDocument(html: string) {
  const body = extractEmailBodyHtml(html);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>Email</title>
<style>
  html, body { margin: 0 !important; padding: 0 !important; }
  body { background: #f0f0f0; }
  img { border: 0; outline: none; text-decoration: none; }
  table { border-collapse: collapse; }
</style>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;">
${body}
</body>
</html>`;
}

/** Browsers rewrite #ffffff → rgb() in live DOM; Outlook then paints black. */
function preserveHexColors(html: string) {
  return html.replace(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)/gi,
    (_m, r, g, b) => {
      const hex = (n: string) =>
        Math.max(0, Math.min(255, Math.round(Number(n))))
          .toString(16)
          .padStart(2, "0");
      return `#${hex(r)}${hex(g)}${hex(b)}`;
    },
  );
}

function escAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** Always returns a complete <!DOCTYPE html>… document. */
export function buildEmailDocument(html: string) {
  const trimmed = html.trim();
  if (isFullHtmlDocument(trimmed)) {
    return preserveHexColors(trimmed);
  }
  return preserveHexColors(fullDocument(trimmed));
}

/**
 * Outlook-safe card: one image in a table (Word ignores position:absolute).
 * Uses the designer PNG snapshot so paste matches what you designed.
 */
export function buildOutlookPngEmailHtml(input: {
  imageSrc: string;
  width: number;
  height: number;
  alt?: string;
}) {
  const w = Math.max(1, Math.round(input.width));
  const h = Math.max(1, Math.round(input.height));
  const alt = escAttr(input.alt ?? "Gratitude card");
  const src = escAttr(input.imageSrc);
  const img = `<img src="${src}" width="${w}" height="${h}" alt="${alt}" style="display:block;border:0;outline:none;text-decoration:none;width:${w}px;height:${h}px;max-width:100%;" />`;
  const fragment = [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${w}" style="border-collapse:collapse;width:${w}px;max-width:100%;margin:0 auto;background:#ffffff;">`,
    `  <tr>`,
    `    <td style="padding:0;line-height:0;font-size:0;">${img}</td>`,
    `  </tr>`,
    `</table>`,
  ].join("\n");

  return {
    fragment,
    document: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=${w}, initial-scale=1" />
<title>${alt}</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;">
${fragment}
</body>
</html>`,
  };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(new Error("Could not read image for Outlook copy"));
    reader.readAsDataURL(blob);
  });
}

async function writeClipboard(parts: Record<string, Blob>) {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("Clipboard API unavailable");
  }
  await navigator.clipboard.write([new ClipboardItem(parts)]);
}

/**
 * Copy an Outlook-safe version of the card using the PNG snapshot.
 * Absolute canvas HTML is for in-app preview only — Word/Outlook strips
 * position:absolute, so paste must be image+table.
 *
 * Important: write clean HTML only. Never put Windows CF_HTML headers
 * (Version:0.9 StartHTML:…) into text/html — the browser adds that
 * format itself; including it makes Outlook paste the headers as text.
 */
export async function copyOutlookPngForPaste(input: {
  pngUrl: string;
  width: number;
  height: number;
  alt?: string;
}): Promise<void> {
  const res = await fetch(input.pngUrl);
  if (!res.ok) {
    throw new Error(
      "Could not load PNG preview. Save & compile in Designer first.",
    );
  }
  const pngBlob = await res.blob();
  const dataUrl = await blobToDataUrl(pngBlob);
  const { fragment, document: doc } = buildOutlookPngEmailHtml({
    imageSrc: dataUrl,
    width: input.width,
    height: input.height,
    alt: input.alt,
  });
  const htmlBlob = new Blob([fragment], { type: "text/html" });
  const plain = new Blob(["\u00a0"], { type: "text/plain" });

  // HTML only first — most reliable for Outlook (no CF_HTML prefix, no
  // competing image/png that can confuse Word's paste).
  try {
    await writeClipboard({
      "text/html": htmlBlob,
      "text/plain": plain,
    });
    return;
  } catch {
    /* fall through */
  }

  try {
    await writeClipboard({
      "text/html": new Blob([doc], { type: "text/html" }),
      "text/plain": plain,
    });
    return;
  } catch {
    /* fall through */
  }

  // Last resort: contenteditable selection copy (browser builds CF_HTML).
  const host = document.createElement("div");
  host.setAttribute("contenteditable", "true");
  host.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;";
  host.innerHTML = fragment;
  document.body.appendChild(host);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(host);
  selection?.removeAllRanges();
  selection?.addRange(range);
  const ok = document.execCommand("copy");
  selection?.removeAllRanges();
  document.body.removeChild(host);
  if (!ok) {
    throw new Error(
      "Browser blocked copy. Try again, or open the PNG preview and copy the image.",
    );
  }
}

/**
 * Copy absolute/canvas HTML source (for developers / web clients).
 * Not reliable for Outlook Desktop — Word strips position:absolute.
 * Prefer copyOutlookPngForPaste for Outlook paste.
 */
export async function copyEmailHtmlForPaste(html: string): Promise<void> {
  const trimmed = preserveHexColors(html.trim());
  if (!trimmed) throw new Error("Nothing to copy.");

  const doc = buildEmailDocument(trimmed);
  const fragment = extractEmailBodyHtml(doc);
  const plain = new Blob(["\u00a0"], { type: "text/plain" });

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([fragment], { type: "text/html" }),
          "text/plain": plain,
        }),
      ]);
      return;
    } catch {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([doc], { type: "text/html" }),
            "text/plain": plain,
          }),
        ]);
        return;
      } catch {
        /* fall through */
      }
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(doc);
    return;
  }

  throw new Error("Browser blocked copy.");
}

/** @deprecated Prefer copyEmailHtmlForPaste(html) or copyOutlookPngForPaste. */
export async function copySelectionFromIframe(
  iframe: HTMLIFrameElement,
  sourceHtml?: string,
): Promise<void> {
  if (sourceHtml?.trim()) {
    await copyEmailHtmlForPaste(sourceHtml);
    return;
  }
  const doc = iframe.contentDocument;
  if (!doc?.body) throw new Error("Email preview frame is not ready.");
  await copyEmailHtmlForPaste(preserveHexColors(doc.body.innerHTML));
}

export async function copyHtmlSource(html: string) {
  const trimmed = html.trim();
  if (!trimmed) throw new Error("Nothing to copy.");
  await navigator.clipboard.writeText(buildEmailDocument(trimmed));
}

export function openEmailInNewTab(html: string) {
  const trimmed = html.trim();
  if (!trimmed) throw new Error("Nothing to open.");
  const blob = new Blob([buildEmailDocument(trimmed)], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error("Popup blocked — allow popups for this site, then try again.");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** True only for legacy broken absolute HTML (not the new fixed canvas stage). */
export function looksLikeAbsoluteEmail(html: string) {
  if (/grat-canvas-stage/i.test(html)) return false;
  return /position\s*:\s*absolute/i.test(html);
}

/** True when HTML is the fixed canvas absolute stage (preview-only; not Outlook-safe). */
export function isCanvasAbsoluteEmail(html: string) {
  return /grat-canvas-stage/i.test(html);
}
