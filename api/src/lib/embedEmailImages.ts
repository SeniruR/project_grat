import { readFile } from "node:fs/promises";
import path from "node:path";
import { absoluteUploadPath } from "./uploads.js";

export type InlineEmailAttachment = {
  cid: string;
  filename: string;
  content: Buffer;
  contentType: string;
};

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

function guessMime(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

/** Extract storage key from any URL/path that points at /uploads/... */
export function storageKeyFromUploadUrl(src: string): string | null {
  const trimmed = src.trim().replace(/&amp;/g, "&");
  if (/^(data:|cid:)/i.test(trimmed)) return null;
  const m = trimmed.match(/\/uploads\/([^?"']+)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1].replace(/\\/g, "/"));
  } catch {
    return m[1].replace(/\\/g, "/");
  }
}

function collectImageUrls(html: string): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/\bsrc\s*=\s*(["'])([^"']+)\1/gi)) {
    urls.add(m[2].trim());
  }
  for (const m of html.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) {
    urls.add(m[2].trim());
  }
  return [...urls];
}

/**
 * Replace /uploads/ image URLs with cid: references and attach file bytes.
 * Recipients see images even when PUBLIC_API_URL is localhost-only.
 */
export async function embedLocalUploadImages(
  html: string,
  _publicBaseUrl?: string,
): Promise<{ html: string; attachments: InlineEmailAttachment[] }> {
  const attachments: InlineEmailAttachment[] = [];
  const urlToCid = new Map<string, string>();

  for (const url of collectImageUrls(html)) {
    const key = storageKeyFromUploadUrl(url);
    if (!key || !IMAGE_EXT.test(key)) continue;
    if (urlToCid.has(url)) continue;

    try {
      const content = await readFile(absoluteUploadPath(key));
      const cid = `grat-${attachments.length}-${path.basename(key).replace(/[^\w.-]+/g, "")}@grat`;
      attachments.push({
        cid,
        filename: path.basename(key),
        content,
        contentType: guessMime(key),
      });
      urlToCid.set(url, cid);
    } catch {
      /* missing file on disk — leave URL as-is */
    }
  }

  if (!urlToCid.size) return { html, attachments };

  let out = html;
  for (const [url, cid] of urlToCid) {
    const cidRef = `cid:${cid}`;
    out = out.split(url).join(cidRef);
    // HTML-escaped ampersands in stored HTML
    if (url.includes("&")) {
      out = out.split(url.replace(/&/g, "&amp;")).join(cidRef);
    }
  }

  return { html: out, attachments };
}
