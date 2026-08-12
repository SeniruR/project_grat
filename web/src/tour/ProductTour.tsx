import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useTour } from "./TourContext";

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;

function readTargetRect(target: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 && r.height < 1) return null;
  return {
    top: Math.max(0, r.top - PAD),
    left: Math.max(0, r.left - PAD),
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

export function ProductTour() {
  const { active, step, stepIndex, steps, next, skip } = useTour();
  const location = useLocation();
  const [rect, setRect] = useState<Rect | null>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const [calloutHeight, setCalloutHeight] = useState(200);

  useLayoutEffect(() => {
    if (!active || !step) {
      setRect(null);
      return;
    }

    setRect(null);

    let cancelled = false;
    let tries = 0;
    let didScroll = false;
    const timers: number[] = [];
    let observer: ResizeObserver | null = null;

    const apply = () => {
      if (cancelled) return;
      setRect(readTargetRect(step.target));
    };

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(
        `[data-tour="${step.target}"]`,
      );

      if (!el) {
        setRect(null);
        if (tries < 30) {
          tries += 1;
          timers.push(window.setTimeout(measure, 50));
        }
        return;
      }

      // Instant scroll so getBoundingClientRect matches final layout immediately.
      if (!didScroll) {
        didScroll = true;
        el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      }

      apply();

      if (!observer) {
        observer = new ResizeObserver(() => apply());
        observer.observe(el);
      }

      // Layout can still settle (fonts, images, async page content).
      if (tries < 12) {
        tries += 1;
        timers.push(window.setTimeout(measure, 50));
      }
    };

    measure();
    requestAnimationFrame(() => {
      requestAnimationFrame(apply);
    });

    const onViewportChange = () => apply();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
      observer?.disconnect();
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [active, step, location.pathname, location.search]);

  useLayoutEffect(() => {
    const el = calloutRef.current;
    if (!el) return;
    setCalloutHeight(el.getBoundingClientRect().height || 200);
  }, [step, rect, stepIndex]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, skip]);

  if (!active || !step) return null;

  const isLast = stepIndex >= steps.length - 1;
  const calloutStyle = positionCallout(rect, calloutHeight);

  return createPortal(
    <div
      className="tour-root"
      role="dialog"
      aria-modal="true"
      aria-label="Product tutorial"
    >
      <div className="tour-scrim" aria-hidden />
      {rect ? (
        <div
          className="tour-spotlight"
          aria-hidden
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      ) : null}
      <div className="tour-callout" ref={calloutRef} style={calloutStyle}>
        <p className="tour-callout-step muted small">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h2 className="tour-callout-title">{step.title}</h2>
        <p className="tour-callout-body">{step.body}</p>
        <div className="tour-callout-actions">
          <button type="button" className="ghost" onClick={skip}>
            Skip tutorial
          </button>
          <button type="button" onClick={next}>
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function positionCallout(
  rect: Rect | null,
  calloutHeight: number,
): CSSProperties {
  const width = Math.min(360, window.innerWidth - 24);
  if (!rect) {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      width,
      transform: "translate(-50%, -50%)",
    };
  }

  const gap = 12;
  const height = Math.max(calloutHeight, 120);
  const spaceBelow = window.innerHeight - (rect.top + rect.height);
  const spaceAbove = rect.top;
  const placeBelow =
    spaceBelow >= height + gap || spaceBelow >= spaceAbove;

  let top = placeBelow
    ? rect.top + rect.height + gap
    : rect.top - height - gap;

  // Center horizontally on the highlighted target.
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.min(Math.max(12, left), window.innerWidth - width - 12);

  top = Math.min(
    Math.max(12, top),
    Math.max(12, window.innerHeight - height - 12),
  );

  return {
    position: "fixed",
    top,
    left,
    width,
  };
}
