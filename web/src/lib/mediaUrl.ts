/** Public API origin used for /uploads media (baked in at build time). */
export function apiBaseUrl() {
  return (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(
    /\/$/,
    "",
  );
}

/**
 * Point any upload URL at the live API host.
 * Fixes Render (and local) when the API stored PUBLIC_API_URL as localhost
 * or a bare /uploads/... path while the UI is on another origin.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;

  const base = apiBaseUrl();

  if (raw.startsWith("/uploads/")) return `${base}${raw}`;

  try {
    const abs = new URL(raw, base);
    if (abs.pathname.startsWith("/uploads/")) {
      return `${base}${abs.pathname}${abs.search}`;
    }
  } catch {
    /* fall through */
  }

  return raw;
}

/** Rewrite img src / CSS url(...) upload references inside HTML. */
export function rewriteMediaUrlsInHtml(html: string): string {
  if (!html) return html;
  const base = apiBaseUrl();

  const rewriteRef = (ref: string) => {
    const trimmed = ref.trim();
    if (!trimmed || /^(data:|blob:|cid:|\/\/)/i.test(trimmed)) return ref;
    const resolved = resolveMediaUrl(trimmed);
    return resolved ?? ref;
  };

  return html
    .replace(
      /(\bsrc\s*=\s*)(["'])([^"']*)\2/gi,
      (_full, attr: string, quote: string, src: string) =>
        `${attr}${quote}${rewriteRef(src)}${quote}`,
    )
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_full, _q, ref: string) => {
      const next = rewriteRef(ref);
      if (next === ref) return `url(${_q || ""}${ref}${_q || ""})`;
      return `url(${JSON.stringify(next)})`;
    })
    .replace(
      new RegExp(
        `https?://[^"'\\s)]+/uploads/`,
        "gi",
      ),
      `${base}/uploads/`,
    );
}
