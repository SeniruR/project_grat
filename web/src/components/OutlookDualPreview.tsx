import { useEffect, useMemo, useRef, useState } from "react";
import { buildEmailDocument } from "../lib/copyEmail";
import { inferEmailWidth, measureEmailContentHeight } from "../lib/rasterizeEmailHtml";
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

/** HTML email preview - always width-fit, with optional copy actions. */
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
  const cardWidth = useMemo(
    () => inferEmailWidth(safe, designWidth),
    [safe, designWidth],
  );
  const srcDoc = useMemo(
    () => (safe ? buildEmailDocument(safe) : ""),
    [safe],
  );
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [fitZoom, setFitZoom] = useState(1);
  const [contentH, setContentH] = useState(designHeight);
  const [browserCopyOpen, setBrowserCopyOpen] = useState(false);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    let timer = 0;
    const measure = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const paneWidth = el.getBoundingClientRect().width;
        if (paneWidth < 40) return;
        const next = Math.min(1, Math.max(0.35, (paneWidth - 24) / cardWidth));
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
  }, [cardWidth, safe]);

  function onFrameLoad(iframe: HTMLIFrameElement) {
    try {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      const measured = measureEmailContentHeight(doc, iframe);
      const next = Math.min(8_000, Math.max(120, measured + 8));
      setContentH((prev) => (Math.abs(prev - next) < 4 ? prev : next));
      iframe.style.height = `${next}px`;
      iframe.style.overflow = "hidden";
      doc.documentElement.style.overflow = "hidden";
      doc.body.style.overflow = "hidden";
    } catch {
      /* opaque origin */
    }
  }

  if (!safe) return null;

  const Wrapper = embedded ? "div" : "section";
  const wrapperClass = embedded
    ? "outlook-preview-embedded"
    : "panel outlook-preview-panel";

  return (
    <Wrapper className={wrapperClass}>
      <div className="outlook-preview-toolbar">
        {embedded ? null : <h2>Preview</h2>}
        {showCopyActions ? (
          <div className="outlook-preview-actions">
            <div className="outlook-copy" role="group" aria-label="Copy email">
              <button type="button" onClick={() => setBrowserCopyOpen(true)}>
                Copy for Outlook
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="outlook-dual-scroll">
        <div className="outlook-measure-probe full" ref={measureRef} aria-hidden />
        <div className="outlook-dual single">
          <article className="outlook-pane">
            <div className="outlook-pane-body">
              <div
                className="email-preview-scale"
                style={{
                  width: cardWidth * fitZoom,
                  height: contentH * fitZoom,
                }}
              >
                <iframe
                  title="Email preview"
                  className="outlook-preview-iframe"
                  sandbox="allow-same-origin"
                  scrolling="no"
                  srcDoc={srcDoc}
                  onLoad={(e) => onFrameLoad(e.currentTarget)}
                  style={{
                    width: cardWidth,
                    height: contentH,
                    transform: `scale(${fitZoom})`,
                  }}
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
          designWidth={cardWidth}
          designHeight={designHeight}
          pasteMode={pasteMode}
          onClose={() => setBrowserCopyOpen(false)}
        />
      ) : null}
    </Wrapper>
  );
}
