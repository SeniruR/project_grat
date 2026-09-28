import { useEffect, useRef, useState } from "react";

const BLEND_SEC = 0.5;

type Props = {
  src: string;
  poster?: string;
  className?: string;
  /** Play with sound when the browser allows it (default true). */
  withAudio?: boolean;
};

/**
 * Looped hero video. The end blends into the start over half a second.
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
  const [seam, setSeam] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);

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
    setHasFrame(false);
    setSeam(false);
    blendingRef.current = false;
    primary.currentTime = 0;
    secondary.pause();
    secondary.preload = "auto";

    async function start(frontEl: HTMLVideoElement, backEl: HTMLVideoElement) {
      if (!withAudio) {
        frontEl.muted = true;
        backEl.muted = true;
        await frontEl.play().catch(() => undefined);
        if (!cancelled && !frontEl.paused) setHasFrame(true);
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
          setHasFrame(true);
        }
      } catch {
        frontEl.muted = true;
        await frontEl.play().catch(() => undefined);
        if (!cancelled) {
          setNeedsGesture(true);
          if (!frontEl.paused) setHasFrame(true);
        }
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
      const current = front === "a" ? a : b;
      void current.play().catch(() => undefined);
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

    let fadeTimer = 0;
    let swapTimer = 0;

    let prepared = false;

    function prepareBack() {
      if (!backEl || prepared) return;
      prepared = true;
      if (backEl.currentTime <= 0.02) return;
      const hold = () => backEl.pause();
      backEl.addEventListener("seeked", hold, { once: true });
      try {
        backEl.currentTime = 0;
      } catch {
        prepared = false;
      }
    }

    function beginBlend() {
      if (!frontEl || !backEl || blendingRef.current) return;
      blendingRef.current = true;
      const nextFront = front === "a" ? "b" : "a";

      const reveal = () => {
        applySound(nextFront, soundEnabledRef.current && withAudio);
        setSeam(true);
        swapTimer = window.setTimeout(() => {
          setFront(nextFront);
          setSeam(false);
          frontEl.pause();
          blendingRef.current = false;
        }, BLEND_SEC * 1000);
      };

      const startBack = () => {
        void backEl
          .play()
          .then(() => {
            if (typeof backEl.requestVideoFrameCallback === "function") {
              backEl.requestVideoFrameCallback(() => reveal());
            } else {
              reveal();
            }
          })
          .catch(() => {
            blendingRef.current = false;
          });
      };

      if (backEl.currentTime > 0.05) {
        backEl.addEventListener("seeked", startBack, { once: true });
        try {
          backEl.currentTime = 0;
        } catch {
          startBack();
        }
      } else {
        startBack();
      }
    }

    function armBlend() {
      if (!frontEl || blendingRef.current) return;
      const dur = frontEl.duration;
      if (!Number.isFinite(dur) || dur <= BLEND_SEC + 0.2) return;
      const remaining = dur - frontEl.currentTime;
      if (remaining < BLEND_SEC + 0.4) prepareBack();
      window.clearTimeout(fadeTimer);
      const waitMs = (remaining - BLEND_SEC) * 1000;
      if (waitMs <= 0) beginBlend();
      else fadeTimer = window.setTimeout(beginBlend, waitMs);
    }

    frontEl.addEventListener("timeupdate", armBlend);
    frontEl.addEventListener("playing", armBlend);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(swapTimer);
      frontEl.removeEventListener("timeupdate", armBlend);
      frontEl.removeEventListener("playing", armBlend);
    };
  }, [front, src, withAudio]);

  return (
    <div
      className={`hero-loop-video${hasFrame ? " is-playing" : ""}${seam ? " is-seam" : ""}${className ? ` ${className}` : ""}`}
    >
      {poster ? (
        <img className="hero-loop-poster" src={poster} alt="" />
      ) : null}
      <video
        ref={aRef}
        className={`hero-loop-video-layer${front === "a" ? " is-front" : ""}`}
        src={src}
        playsInline
        preload="auto"
        autoPlay
        aria-hidden
        onPlaying={() => setHasFrame(true)}
      />
      <video
        ref={bRef}
        className={`hero-loop-video-layer${front === "b" ? " is-front" : ""}`}
        src={src}
        playsInline
        preload="auto"
        muted
        aria-hidden
      />
      {needsGesture ? (
        <button
          type="button"
          className="hero-loop-sound-btn"
          onClick={() => {
            applySound(front, true);
            const current = front === "a" ? aRef.current : bRef.current;
            void current?.play().catch(() => undefined);
            setNeedsGesture(false);
          }}
        >
          Tap for sound
        </button>
      ) : null}
    </div>
  );
}
