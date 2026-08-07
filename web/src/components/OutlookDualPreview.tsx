import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { openEmailInNewTab } from "../lib/copyEmail";
import { EmailBrowserCopyModal } from "./EmailBrowserCopyModal";

type Props = {
  html: string;
  /** Compiled PNG for Outlook Desktop paste (Word ignores absolute HTML) */
  pngUrl?: string | null;
  /** Nominal email card width used for Fit / scale math */
  designWidth?: number;
  /** Designer canvas height for Outlook PNG paste sizing */
  designHeight?: number;
  /** Show copy actions for paste into Outlook / Gmail */
  showCopyActions?: boolean;
  /** Nest inside another Preview panel (skip outer chrome / title) */
  embedded?: boolean;
  /** Outlook paste strategy */
  pasteMode?: "html" | "png" | "auto";
};

const ZOOM_PRESETS = [
  { label: "Fit", value: "fit" as const },
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1 },
];

/** HTML email preview (Outlook Web-style) with zoom + copy actions. */
export function OutlookDualPreview({
  html,
  pngUrl,
  designWidth = 600,
  designHeight = 800,
  showCopyActions = true,
  embedded = false,
  pasteMode = "auto",
}: Props) {
  const safe = useMemo(() => html.trim(), [html]);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<"fit" | number>(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [browserCopyOpen, setBrowserCopyOpen] = useState(false);

  // Measure a stable width probe that is NOT affected by email zoom, so Fit
  // cannot ResizeObserver-loop (that was the preview "vibration").
  // Fit may scale ABOVE 100% so a 600px design fills a wide single pane.
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    let timer = 0;
    const measure = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const paneWidth = el.getBoundingClientRect().width;
        if (paneWidth < 40) return;
        const next = Math.min(2.5, Math.max(0.35, (paneWidth - 32) / designWidth));
        const rounded = Math.round(next * 100) / 100;
        setFitZoom((prev) => (Math.abs(prev - rounded) < 0.01 ? prev : rounded));
      }, 120);
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [designWidth, safe]);

  if (!safe) return null;

  const zoom = mode === "fit" ? fitZoom : mode;

  function openToCopy() {
    setCopyNotice(null);
    try {
      openEmailInNewTab(safe);
      setCopyNotice(
        "Opened in a new tab — click that page, press Ctrl+A then Ctrl+C, then paste into Outlook (Ctrl+V).",
      );
    } catch (err) {
      setCopyNotice(err instanceof Error ? err.message : "Could not open tab");
    }
  }

  const Wrapper = embedded ? "div" : "section";
  const wrapperClass = embedded
    ? "outlook-preview-embedded"
    : "panel outlook-preview-panel";

  return (
    <Wrapper className={wrapperClass}>
      <div className="outlook-preview-toolbar">
        {embedded ? null : (
          <div>
            <h2>Preview</h2>
            <p className="muted small tip">
              Locked to canvas width ({designWidth}px). Default zoom is{" "}
              <strong>100%</strong> (true size). <strong>Fit</strong> only
              visually scales — it does not resize the card layout.
            </p>
          </div>
        )}
        <div className="outlook-preview-actions">
          {showCopyActions ? (
            <div className="outlook-copy" role="group" aria-label="Copy email">
              <button type="button" onClick={() => setBrowserCopyOpen(true)}>
                Copy for Outlook
              </button>
              <button
                type="button"
                className="ghost small"
                onClick={openToCopy}
              >
                Open in new tab
              </button>
            </div>
          ) : null}
          <div className="outlook-zoom" role="group" aria-label="Preview zoom">
            <span className="outlook-zoom-label">Zoom</span>
            {ZOOM_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`ghost small ${mode === p.value ? "active" : ""}`}
                onClick={() => setMode(p.value)}
              >
                {p.label}
              </button>
            ))}
            <span className="muted small outlook-zoom-pct">
              {Math.round(zoom * 100)}%
            </span>
          </div>
        </div>
      </div>
      {copyNotice ? <p className="notice">{copyNotice}</p> : null}
      <div className="outlook-dual-scroll">
        <div className="outlook-measure-probe full" ref={measureRef} aria-hidden />
        <div className="outlook-dual single">
          <article className="outlook-pane">
            <div className="outlook-pane-body">
              <div
                className="email-preview-scale"
                style={
                  {
                    "--preview-zoom": String(zoom),
                    "--preview-design-width": `${designWidth}px`,
                  } as CSSProperties
                }
              >
                <div
                  className="email-preview outlook-web-sim"
                  style={{
                    width: designWidth,
                    minWidth: designWidth,
                    maxWidth: designWidth,
                  }}
                  dangerouslySetInnerHTML={{ __html: safe }}
                />
              </div>
            </div>
          </article>
        </div>
      </div>

      {browserCopyOpen ? (
        <EmailBrowserCopyModal
          html={safe}
          pngUrl={pngUrl}
          designWidth={designWidth}
          designHeight={designHeight}
          pasteMode={pasteMode}
          onClose={() => setBrowserCopyOpen(false)}
        />
      ) : null}
    </Wrapper>
  );
}
