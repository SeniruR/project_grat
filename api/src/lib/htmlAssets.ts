import path from "node:path";
import { publicUploadUrl } from "./uploads.js";

export type AssetRef = {
  fileName: string;
  storageKey: string;
};

/**
 * Rewrites bare / relative image src values to absolute upload URLs.
 * Examples that get resolved when a matching asset fileName exists:
 *   src="photo.png"
 *   src='./photo.png'
 *   src="images/photo.png"  (matched by basename)
 * Leaves http(s), data:, cid:, and already-/uploads/ paths alone.
 */
export function resolveHtmlImageSrcs(
  html: string,
  assets: AssetRef[],
  publicBaseUrl: string,
): string {
  if (!html || assets.length === 0) return html;

  const byName = new Map<string, AssetRef>();
  for (const asset of assets) {
    byName.set(asset.fileName.toLowerCase(), asset);
    byName.set(path.basename(asset.fileName).toLowerCase(), asset);
  }

  const base = publicBaseUrl.replace(/\/$/, "");

  return html.replace(
    /(\bsrc\s*=\s*)(["'])([^"']*)\2/gi,
    (full, attr: string, quote: string, src: string) => {
      const trimmed = src.trim();
      if (!trimmed) return full;
      if (/^(https?:|data:|cid:|\/\/)/i.test(trimmed)) return full;
      if (trimmed.startsWith("/uploads/")) {
        // Ensure absolute for email/preview when only path was stored
        if (trimmed.startsWith("http")) return full;
        return `${attr}${quote}${base}${trimmed}${quote}`;
      }

      const baseName = path.basename(trimmed.replace(/\\/g, "/")).toLowerCase();
      const asset = byName.get(baseName);
      if (!asset) return full;

      const url = `${base}${publicUploadUrl(asset.storageKey)}`;
      return `${attr}${quote}${url}${quote}`;
    },
  );
}

export function suggestedImgTag(fileName: string): string {
  const safe = fileName.replace(/"/g, "");
  return `<img src="${safe}" alt="" width="560" style="display:block;border:0;max-width:100%;height:auto;" />`;
}
