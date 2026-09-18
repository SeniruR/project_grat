import { useEffect, useState } from "react";
import {
  applySiteTheme,
  readStoredTheme,
  type SiteTheme,
} from "../lib/theme";

/** Test control: evening meadow, morning mist, still (quiet gratitude). */
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<SiteTheme>(() => readStoredTheme());

  useEffect(() => {
    applySiteTheme(theme);
  }, [theme]);

  return (
    <label className="theme-switcher">
      <span className="visually-hidden">Theme</span>
      <select
        className="theme-switcher-select"
        value={theme}
        onChange={(e) => setTheme(e.target.value as SiteTheme)}
        aria-label="Site theme"
        title="Site theme (test)"
      >
        <option value="evening">Evening</option>
        <option value="morning">Morning</option>
        <option value="still">Still</option>
      </select>
    </label>
  );
}
