import { useEffect, useState } from "react";
import { HeroLoopVideo } from "./HeroLoopVideo";
import { useSiteTheme } from "../lib/useSiteTheme";
import type { SiteTheme } from "../lib/theme";

const VIDEO_THEMES: SiteTheme[] = ["evening", "open"];

type Props = {
  onEnter: () => void;
};

/** Full-viewport meadow video on marketplace load (evening / open). */
export function MarketplaceVideoIntro({ onEnter }: Props) {
  const theme = useSiteTheme();
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!VIDEO_THEMES.includes(theme)) {
      onEnter();
    }
  }, [theme, onEnter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onEnter();
    }
  }, [onEnter]);

  if (!VIDEO_THEMES.includes(theme) || !visible) return null;

  function dismiss() {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(() => {
      setVisible(false);
      onEnter();
    }, 520);
  }

  return (
    <div
      className={`marketplace-video-intro${exiting ? " is-exiting" : ""}`}
      role="dialog"
      aria-label="Welcome"
    >
      <HeroLoopVideo
        className="marketplace-video-intro-media"
        src="/meadow-hero-whatsapp.mp4"
        poster="/marketplace-hero-illustration.png"
      />
      <div className="marketplace-video-intro-shade" aria-hidden />
      <div className="marketplace-video-intro-copy">
        <p className="marketplace-video-intro-brand">Gratitude Bloom</p>
        <p className="marketplace-video-intro-lede">
          Thank a colleague with a ready-made card.
        </p>
        <button type="button" className="marketplace-video-intro-enter" onClick={dismiss}>
          Enter
        </button>
      </div>
    </div>
  );
}
