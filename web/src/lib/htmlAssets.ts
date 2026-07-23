/** Browser-side mirror of API resolveHtmlImageSrcs for live preview. */
export function resolveHtmlImageSrcsClient(
  html: string,
  assets: Array<{ fileName: string; storageKey: string }>,
  apiBase: string,
): string {
  if (!html || assets.length === 0) return html;

  const byName = new Map<string, { fileName: string; storageKey: string }>();
  for (const asset of assets) {
    byName.set(asset.fileName.toLowerCase(), asset);
    const base = asset.fileName.split(/[/\\]/).pop()?.toLowerCase();
    if (base) byName.set(base, asset);
  }

  const base = apiBase.replace(/\/$/, "");

  return html.replace(
    /(\bsrc\s*=\s*)(["'])([^"']*)\2/gi,
    (full, attr: string, quote: string, src: string) => {
      const trimmed = src.trim();
      if (!trimmed) return full;
      if (/^(https?:|data:|cid:|\/\/)/i.test(trimmed)) return full;
      if (trimmed.startsWith("/uploads/")) {
        return `${attr}${quote}${base}${trimmed}${quote}`;
      }

      const baseName = trimmed.split(/[/\\]/).pop()?.toLowerCase() ?? "";
      const asset = byName.get(baseName);
      if (!asset) return full;

      const key = asset.storageKey.replace(/\\/g, "/");
      return `${attr}${quote}${base}/uploads/${key}${quote}`;
    },
  );
}

export function suggestedImgTag(fileName: string): string {
  const safe = fileName.replace(/"/g, "");
  return `<img src="${safe}" alt="" width="560" style="display:block;border:0;max-width:100%;height:auto;" />`;
}
