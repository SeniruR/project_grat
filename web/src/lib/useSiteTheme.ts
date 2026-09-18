import { useEffect, useState } from "react";
import {
  SITE_THEME_EVENT,
  isSiteTheme,
  readStoredTheme,
  type SiteTheme,
} from "./theme";

export function useSiteTheme(): SiteTheme {
  const [theme, setTheme] = useState<SiteTheme>(() => readStoredTheme());

  useEffect(() => {
    function syncFromDom() {
      const fromDom = document.documentElement.dataset.theme;
      setTheme(isSiteTheme(fromDom) ? fromDom : readStoredTheme());
    }
    function onTheme(e: Event) {
      const detail = (e as CustomEvent<unknown>).detail;
      if (isSiteTheme(detail)) setTheme(detail);
      else syncFromDom();
    }
    syncFromDom();
    window.addEventListener(SITE_THEME_EVENT, onTheme);
    return () => window.removeEventListener(SITE_THEME_EVENT, onTheme);
  }, []);

  return theme;
}
