import { useEffect, useRef, useState } from "react";

const BLEND_SEC = 0.9;

type Props = {
  src: string;
  poster?: string;
  className?: string;
  /** Play with sound when the browser allows it (default true). */
  withAudio?: boolean;
};

/**
 * Looped hero video with a soft crossfade at the loop seam.
 * Tries unmuted autoplay; if the browser blocks it, starts muted and
 * enables sound on the first user gesture.
 */
export function HeroLoopVideo({
  src,
  poster,
  className,
  withAudio = true,
}: Props) {
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const blendingRef = useRef(false);
  const soundEnabledRef = useRef(false);
  const [front, setFront] = useState<"a" | "b">("a");
  const [needsGesture, setNeedsGesture] = useState(false);

  function applySound(frontKey: "a" | "b", enabled: boolean) {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;
    soundEnabledRef.current = enabled;
    a.muted = !enabled || frontKey !== "a";
    b.muted = !enabled || frontKey !== "b";
    a.volume = frontKey === "a" ? 1 : 0;
    b.volume = frontKey === "b" ? 1 : 0;
  }

  useEffect(() => {
    const primary = aRef.current;
    const secondary = bRef.current;
    if (!primary || !secondary) return;

    let cancelled = false;
    primary.currentTime = 0;
    secondary.pause();

    async function start(
      frontEl: HTMLVideoElement,
      backEl: HTMLVideoElement,
    ) {
      if (!withAudio) {
        frontEl.muted = true;
        backEl.muted = true;
        await frontEl.play().catch(() => undefined);
        return;
      }

      frontEl.muted = false;
      frontEl.volume = 1;
      backEl.muted = true;
      backEl.volume = 0;

      try {
        await frontEl.play();
        if (!cancelled) {
          soundEnabledRef.current = true;
          setNeedsGesture(false);
        }
      } catch {
        // Browsers usually block unmuted autoplay — start muted, unlock on gesture.
        frontEl.muted = true;
        await frontEl.play().catch(() => undefined);
        if (!cancelled) setNeedsGesture(true);
      }
    }

    void start(primary, secondary);
    return () => {
      cancelled = true;
    };
  }, [src, withAudio]);

  useEffect(() => {
    if (!needsGesture || !withAudio) return;

    function unlock() {
      const a = aRef.current;
      const b = bRef.current;
      if (!a || !b) return;
      applySound(front, true);
      void a.play().catch(() => undefined);
      void b.play().catch(() => undefined);
      setNeedsGesture(false);
    }

    const opts = { once: true, capture: true } as const;
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    return () => {
      window.removeEventListener("pointerdown", unlock, opts);
      window.removeEventListener("keydown", unlock, opts);
    };
  }, [needsGesture, withAudio, front]);

  useEffect(() => {
    const frontEl = front === "a" ? aRef.current : bRef.current;
    const backEl = front === "a" ? bRef.current : aRef.current;
    if (!frontEl || !backEl) return;

    applySound(front, soundEnabledRef.current && withAudio);

    function onTime() {
      if (!frontEl || !backEl || blendingRef.current) return;
      const dur = frontEl.duration;
      if (!Number.isFinite(dur) || dur <= BLEND_SEC + 0.2) return;
      if (frontEl.currentTime < dur - BLEND_SEC) return;

      blendingRef.current = true;
      backEl.currentTime = 0;
      // Only the new front should carry audio during the crossfade.
      const nextFront = front === "a" ? "b" : "a";
      applySound(nextFront, soundEnabledRef.current && withAudio);
      void backEl.play().catch(() => undefined);
      setFront(nextFront);

      window.setTimeout(() => {
        frontEl.pause();
        blendingRef.current = false;
      }, BLEND_SEC * 1000);
    }

    frontEl.addEventListener("timeupdate", onTime);
    return () => frontEl.removeEventListener("timeupdate", onTime);
  }, [front, src, withAudio]);

  return (
    <div className={`hero-loop-video${className ? ` ${className}` : ""}`}>
      <video
        ref={aRef}
        className={`hero-loop-video-layer${front === "a" ? " is-front" : ""}`}
        src={src}
        poster={poster}
        playsInline
        preload="auto"
        autoPlay
        loop={false}
        aria-hidden
      />
      <video
        ref={bRef}
        className={`hero-loop-video-layer${front === "b" ? " is-front" : ""}`}
        src={src}
        poster={poster}
        playsInline
        preload="auto"
        muted
        loop={false}
        aria-hidden
      />
      {needsGesture ? (
        <button
          type="button"
          className="hero-loop-sound-btn"
          onClick={() => {
            applySound(front, true);
            void aRef.current?.play().catch(() => undefined);
            setNeedsGesture(false);
          }}
        >
          Tap for sound
        </button>
      ) : null}
    </div>
  );
}
