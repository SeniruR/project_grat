import JSZip from "jszip";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;
const FONT_EXT = /\.(woff2?|ttf|otf|eot)$/i;

function baseName(path: string) {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

function normalizeZipPath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function mimeForAsset(fileName: string, fallback: string) {
  if (/\.png$/i.test(fileName)) return "image/png";
  if (/\.gif$/i.test(fileName)) return "image/gif";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg";
  if (/\.woff2$/i.test(fileName)) return "font/woff2";
  if (/\.woff$/i.test(fileName)) return "font/woff";
  if (/\.ttf$/i.test(fileName)) return "font/ttf";
  if (/\.otf$/i.test(fileName)) return "font/otf";
  if (/\.eot$/i.test(fileName)) return "application/vnd.ms-fontobject";
  return fallback;
}

/** Strip scripts and inline event handlers from Canva HTML. */
export function sanitizeEmailHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
}

export type CanvaZipAsset = {
  path: string;
  fileName: string;
  blob: Blob;
  kind: "image" | "font";
};

/**
 * Read a Canva Email HTML ZIP: find the main HTML file, images, and fonts.
 */
export async function parseCanvaZip(file: File): Promise<{
  html: string;
  htmlPath: string;
  assets: CanvaZipAsset[];
}> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.keys(zip.files);

  const htmlPaths = entries.filter((p) => {
    const entry = zip.files[p];
    if (!entry || entry.dir) return false;
    const norm = normalizeZipPath(p);
    if (
      norm.includes("__MACOSX") ||
      norm.split("/").some((s) => s.startsWith("."))
    ) {
      return false;
    }
    return /\.html?$/i.test(norm);
  });

  if (!htmlPaths.length) {
    throw new Error(
      "No HTML file found in the ZIP. In Canva use Share → Download → HTML and images.",
    );
  }

  htmlPaths.sort((a, b) => {
    const an = normalizeZipPath(a);
    const bn = normalizeZipPath(b);
    return an.split("/").length - bn.split("/").length || an.length - bn.length;
  });
  const htmlPath = htmlPaths[0];
  const htmlEntry = zip.files[htmlPath];
  if (!htmlEntry || htmlEntry.dir) {
    throw new Error("Could not read the HTML file from the ZIP.");
  }
  const rawHtml = await htmlEntry.async("string");
  const html = sanitizeEmailHtml(rawHtml);

  const assets: CanvaZipAsset[] = [];
  for (const path of entries) {
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    const norm = normalizeZipPath(path);
    if (norm.includes("__MACOSX")) continue;

    const isImage = IMAGE_EXT.test(norm);
    const isFont = FONT_EXT.test(norm);
    if (!isImage && !isFont) continue;

    const blob = await entry.async("blob");
    const fileName = baseName(norm);
    const typed =
      blob.type && blob.type !== "application/octet-stream"
        ? blob
        : new Blob([blob], {
            type: mimeForAsset(fileName, isFont ? "font/ttf" : "image/jpeg"),
          });
    assets.push({
      path: norm,
      fileName,
      blob: typed,
      kind: isFont ? "font" : "image",
    });
  }

  return { html, htmlPath: normalizeZipPath(htmlPath), assets };
}

/** @deprecated Prefer parseCanvaZip().assets */
export async function parseCanvaZipLegacy(file: File) {
  const { html, htmlPath, assets } = await parseCanvaZip(file);
  return {
    html,
    htmlPath,
    images: assets.filter((a) => a.kind === "image"),
  };
}

function buildUploadLookup(
  uploads: Array<{ fileName: string; path: string; url: string }>,
) {
  const byName = new Map<string, string>();
  const byPath = new Map<string, string>();
  for (const u of uploads) {
    byName.set(u.fileName.toLowerCase(), u.url);
    byPath.set(normalizeZipPath(u.path).toLowerCase(), u.url);
    const parts = normalizeZipPath(u.path).split("/");
    if (parts.length > 1) {
      byPath.set(parts.slice(-2).join("/").toLowerCase(), u.url);
    }
  }
  return { byName, byPath };
}

function resolveLocalUrl(
  raw: string,
  byName: Map<string, string>,
  byPath: Map<string, string>,
) {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  if (/^(https?:|data:|cid:|\/\/)/i.test(trimmed)) return null;
  const norm = normalizeZipPath(trimmed).replace(/^\.\//, "");
  const name = baseName(norm).toLowerCase();
  return (
    byPath.get(norm.toLowerCase()) ||
    byName.get(name) ||
    byPath.get(name) ||
    null
  );
}

/**
 * Rewrite local image srcs and CSS url(...) (fonts/images) to uploaded URLs.
 */
export function rewriteCanvaAssetUrls(
  html: string,
  uploads: Array<{ fileName: string; path: string; url: string }>,
) {
  const { byName, byPath } = buildUploadLookup(uploads);

  let out = html.replace(
    /(\bsrc\s*=\s*)(["'])([^"']+)\2/gi,
    (full, attr: string, quote: string, src: string) => {
      const url = resolveLocalUrl(src, byName, byPath);
      if (!url) return full;
      return `${attr}${quote}${url}${quote}`;
    },
  );

  // @font-face / background-image: url(fonts/foo.woff2)
  out = out.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (full, _q, src: string) => {
    const url = resolveLocalUrl(src, byName, byPath);
    if (!url) return full;
    return `url("${url}")`;
  });

  return out;
}

/** @deprecated Use rewriteCanvaAssetUrls */
export function rewriteCanvaImageSrcs(
  html: string,
  uploads: Array<{ fileName: string; path: string; url: string }>,
) {
  return rewriteCanvaAssetUrls(html, uploads);
}
