export type SiteTheme = "evening" | "morning" | "still" | "open";

export const SITE_THEME_KEY = "gratitude-site-theme";
export const SITE_THEME_EVENT = "gratitude-site-theme";

export function isSiteTheme(value: unknown): value is SiteTheme {
  return (
    value === "evening" ||
    value === "morning" ||
    value === "still" ||
    value === "open"
  );
}

export function readStoredTheme(): SiteTheme {
  try {
    const raw = localStorage.getItem(SITE_THEME_KEY);
    if (raw === "open2") return "open";
    if (isSiteTheme(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "evening";
}

export function applySiteTheme(theme: SiteTheme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(SITE_THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(SITE_THEME_EVENT, { detail: theme }));
}
