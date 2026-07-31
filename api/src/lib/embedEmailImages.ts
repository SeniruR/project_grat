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
  const missing: string[] = [];

  for (const url of collectImageUrls(html)) {
    const key = storageKeyFromUploadUrl(url);
    if (!key || !IMAGE_EXT.test(key)) continue;
    if (urlToCid.has(url)) continue;

    try {
      const content = await readFile(absoluteUploadPath(key));
      // Stable, mailbox-safe cid (no spaces / odd chars)
      const safeBase = path
        .basename(key)
        .replace(/[^\w.-]+/g, "")
        .slice(0, 48);
      const cid = `grat.${attachments.length}.${safeBase}@project.grat`;
      attachments.push({
        cid,
        filename: path.basename(key) || `image-${attachments.length}.png`,
        content,
        contentType: guessMime(key),
      });
      urlToCid.set(url, cid);
    } catch {
      missing.push(key);
    }
  }

  if (!urlToCid.size) {
    if (missing.length) {
      console.warn(
        `[embedLocalUploadImages] no images embedded; missing files: ${missing.slice(0, 5).join(", ")}`,
      );
    }
    return { html, attachments };
  }

  if (missing.length) {
    console.warn(
      `[embedLocalUploadImages] skipped ${missing.length} missing upload(s)`,
    );
  }

  let out = html;
  // Longest URLs first so we don't partially replace nested paths
  const entries = [...urlToCid.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [url, cid] of entries) {
    const cidRef = `cid:${cid}`;
    out = out.split(url).join(cidRef);
    if (url.includes("&")) {
      out = out.split(url.replace(/&/g, "&amp;")).join(cidRef);
    }
  }

  return { html: out, attachments };
}

/**
 * Snapshot /uploads images into data: URLs for stored Sent / draft previews.
 * History must not depend on template files (delete or later re-import would
 * otherwise blank or change historical previews).
 */
export async function inlineLocalUploadImagesAsDataUrls(
  html: string,
): Promise<string> {
  const urlToData = new Map<string, string>();
  const missing: string[] = [];

  for (const url of collectImageUrls(html)) {
    const key = storageKeyFromUploadUrl(url);
    if (!key || !IMAGE_EXT.test(key)) continue;
    if (urlToData.has(url)) continue;

    try {
      const content = await readFile(absoluteUploadPath(key));
      const mime = guessMime(key);
      urlToData.set(url, `data:${mime};base64,${content.toString("base64")}`);
    } catch {
      missing.push(key);
    }
  }

  if (!urlToData.size) {
    if (missing.length) {
      console.warn(
        `[inlineLocalUploadImagesAsDataUrls] missing: ${missing.slice(0, 5).join(", ")}`,
      );
    }
    return html;
  }

  if (missing.length) {
    console.warn(
      `[inlineLocalUploadImagesAsDataUrls] skipped ${missing.length} missing upload(s)`,
    );
  }

  let out = html;
  const entries = [...urlToData.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [url, dataUrl] of entries) {
    out = out.split(url).join(dataUrl);
    if (url.includes("&")) {
      out = out.split(url.replace(/&/g, "&amp;")).join(dataUrl);
    }
  }

  return out;
}
