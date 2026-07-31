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

type ViewMode = "dual" | "desktop" | "web";

const VIEW_PRESETS: Array<{ id: ViewMode; label: string }> = [
  { id: "dual", label: "Both" },
  { id: "desktop", label: "Desktop" },
  { id: "web", label: "Web" },
];

const PANE_META: Record<
  Exclude<ViewMode, "dual"> | "desktop" | "web",
  { label: string; meta: string; sim: string }
> = {
  desktop: {
    label: "Outlook Desktop",
    meta: "Word engine",
    sim: "outlook-desktop-sim",
  },
  web: {
    label: "Outlook Web",
    meta: "Browser engine",
    sim: "outlook-web-sim",
  },
};

/** Approximate classic Outlook (Word) vs Outlook on the web for side-by-side checks. */
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
  const [view, setView] = useState<ViewMode>("web");
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [browserCopyOpen, setBrowserCopyOpen] = useState(false);

  // Measure a stable width probe that is NOT affected by email zoom, so Fit
  // cannot ResizeObserver-loop (that was the preview "vibration").
  // Fit may scale ABOVE 100% so a 600px design fills a wide single pane
  // the way the designer canvas fills its stage — previously capped at 1,
  // which left a tiny left-aligned card in a large empty panel.
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
  }, [designWidth, safe, view]);

  if (!safe) return null;

  const zoom = mode === "fit" ? fitZoom : mode;
  const single = view !== "dual";

  function renderPane(kind: "desktop" | "web") {
    const meta = PANE_META[kind];
    return (
      <article className="outlook-pane">
        <header className="outlook-pane-head">
          <span className="outlook-pane-label">{meta.label}</span>
          <span className="outlook-pane-meta">{meta.meta}</span>
        </header>
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
              className={`email-preview ${meta.sim}`}
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
    );
  }

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
        {embedded ? (
          <div>
            <p className="muted small tip" style={{ margin: 0 }}>
              HTML client preview — use Desktop / Web and Zoom below.
            </p>
          </div>
        ) : (
          <div>
            <h2>Preview</h2>
            <p className="muted small tip">
              {single ? (
                <>
                  Full-width{" "}
                  <strong>
                    {view === "desktop" ? "Outlook Desktop" : "Outlook Web"}
                  </strong>{" "}
                  locked to canvas width ({designWidth}px) so absolute layout
                  stays aligned. Default zoom is <strong>100%</strong> (true
                  size). <strong>Fit</strong> only visually scales — it does not
                  resize the card layout. After canvas edits, Save &amp; compile.
                </>
              ) : (
                <>
                  Same HTML in both panes. <strong>Desktop</strong> squares
                  corners (Word ignores <code>border-radius</code>).{" "}
                  <strong>Web</strong> keeps rounded corners. Use{" "}
                  <strong>Desktop</strong>/<strong>Web</strong> for a bigger
                  single view.
                </>
              )}
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
          <div className="outlook-zoom" role="group" aria-label="Preview view">
            <span className="outlook-zoom-label">View</span>
            {VIEW_PRESETS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`ghost small ${view === v.id ? "active" : ""}`}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
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
        {/* Width probe: matches a single pane's inner width so Fit zoom is stable */}
        <div
          className={`outlook-measure-probe ${single ? "full" : ""}`}
          ref={measureRef}
          aria-hidden
        />
        <div className={`outlook-dual ${single ? "single" : ""}`}>
          {view === "dual" ? (
            <>
              {renderPane("desktop")}
              {renderPane("web")}
            </>
          ) : (
            renderPane(view)
          )}
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
