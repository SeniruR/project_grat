import { useEffect, useState } from "react";
import { resolveMediaUrl } from "../lib/mediaUrl";
import { cropWhiteBoxFromUrl } from "../lib/trimEmailWhiteMargins";

type Props = {
  previewUrl?: string | null;
  /** Shown when there is no PNG snapshot (first letter of the title). */
  fallbackLabel: string;
};

/** Card-grid thumbnail: compiled PNG only (no HTML iframes). */
export function EmailCardThumb({ previewUrl, fallbackLabel }: Props) {
  const png = resolveMediaUrl(previewUrl);
  const letter = fallbackLabel.trim().slice(0, 1).toUpperCase() || "?";
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!png) {
      setSrc(null);
      return;
    }
    let alive = true;
    setSrc(null);
    void cropWhiteBoxFromUrl(png)
      .then((next) => {
        if (alive) setSrc(next);
      })
      .catch(() => {
        if (alive) setSrc(png);
      });
    return () => {
      alive = false;
    };
  }, [png]);

  if (src) {
    return <img className="email-card-thumb-png" src={src} alt="" />;
  }

  if (png) {
    return (
      <span className="email-card-thumb-loading" aria-hidden>
        <span className="email-card-thumb-loading-bar" />
      </span>
    );
  }

  return <span className="email-card-thumb-fallback">{letter}</span>;
}
