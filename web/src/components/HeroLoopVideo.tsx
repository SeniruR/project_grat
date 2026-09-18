import { useEffect, useRef, useState } from "react";

const BLEND_SEC = 0.9;

type Props = {
  src: string;
  poster?: string;
  className?: string;
};

/**
 * Looped muted hero video with a soft crossfade at the loop seam
 * (end → start) so the restart doesn’t hard-cut.
 */
export function HeroLoopVideo({ src, poster, className }: Props) {
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const blendingRef = useRef(false);
  const [front, setFront] = useState<"a" | "b">("a");

  useEffect(() => {
    const primary = aRef.current;
    if (!primary) return;
    primary.currentTime = 0;
    void primary.play().catch(() => undefined);
  }, [src]);

  useEffect(() => {
    const frontEl = front === "a" ? aRef.current : bRef.current;
    const backEl = front === "a" ? bRef.current : aRef.current;
    if (!frontEl || !backEl) return;

    function onTime() {
      if (!frontEl || !backEl || blendingRef.current) return;
      const dur = frontEl.duration;
      if (!Number.isFinite(dur) || dur <= BLEND_SEC + 0.2) return;
      if (frontEl.currentTime < dur - BLEND_SEC) return;

      blendingRef.current = true;
      backEl.currentTime = 0;
      void backEl.play().catch(() => undefined);
      setFront((f) => (f === "a" ? "b" : "a"));

      window.setTimeout(() => {
        frontEl.pause();
        blendingRef.current = false;
      }, BLEND_SEC * 1000);
    }

    frontEl.addEventListener("timeupdate", onTime);
    return () => frontEl.removeEventListener("timeupdate", onTime);
  }, [front, src]);

  const shared = {
    src,
    poster,
    muted: true,
    playsInline: true,
    preload: "auto" as const,
    "aria-hidden": true as const,
  };

  return (
    <div className={`hero-loop-video${className ? ` ${className}` : ""}`}>
      <video
        ref={aRef}
        className={`hero-loop-video-layer${front === "a" ? " is-front" : ""}`}
        {...shared}
      />
      <video
        ref={bRef}
        className={`hero-loop-video-layer${front === "b" ? " is-front" : ""}`}
        {...shared}
      />
    </div>
  );
}
