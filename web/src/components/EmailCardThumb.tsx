import { resolveMediaUrl } from "../lib/mediaUrl";

type Props = {
  previewUrl?: string | null;
  /** Shown when there is no PNG snapshot (first letter of the title). */
  fallbackLabel: string;
};

/** Card-grid thumbnail: compiled PNG only (no HTML iframes). */
export function EmailCardThumb({ previewUrl, fallbackLabel }: Props) {
  const png = resolveMediaUrl(previewUrl);
  const letter = fallbackLabel.trim().slice(0, 1).toUpperCase() || "?";

  if (png) {
    return <img className="email-card-thumb-png" src={png} alt="" />;
  }

  return <span className="email-card-thumb-fallback">{letter}</span>;
}
