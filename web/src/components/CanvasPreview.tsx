import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  extractEmailBodyHtml,
  extractEmailHeadInner,
  EMAIL_LIGHT_SCHEME_HEAD,
  EMAIL_PAPER_BG,
  emailLightSchemeCss,
} from "../lib/emailHtml";
import { measureEmailContentHeight } from "../lib/rasterizeEmailHtml";
import { EmailBrowserCopyModal } from "./EmailBrowserCopyModal";

type Props = {
  /** Designer canvas width (px) */
  width: number;
  /** Designer canvas height (px) - used for fixed PNG preview */
  height: number;
  /** 1:1 PNG snapshot from Save & compile */
  pngUrl?: string | null;
  /** Compiled email HTML */
  html?: string;
  /** Cache-bust token when version changes */
  versionKey?: string | number;
  /** Outlook paste strategy - html for Canva, png for image cards */
  pasteMode?: "html" | "png" | "auto";
  /** Canva: offer HTML paste alongside PNG snapshot */
  offerHtmlPaste?: boolean;
  /**
   * HTML-only preview: hide PNG / Both toggles, fit width to the panel,
   * scroll vertically (Canva / imported HTML emails).
   */
  htmlOnly?: boolean;
};

type Mode = "png" | "html" | "both";

/**
 * Side-by-side PNG + HTML preview, or HTML-only width-fit
 * with vertical scroll (Canva / imported HTML emails).
 */
export function CanvasPreview({
  width,
  height,
  pngUrl,
  html,
  versionKey,
  pasteMode = "auto",
  offerHtmlPaste = false,
  htmlOnly = false,
}: Props) {
  const w = Math.max(200, Math.round(width) || 600);
  const fixedH = Math.max(200, Math.round(height) || 800);
  const png = (pngUrl ?? "").trim();
  const bodyHtml = (html ?? "").trim();
  const fluidHtml = htmlOnly || pasteMode === "html";

  const canBoth = !htmlOnly && Boolean(png && bodyHtml);
  const [mode, setMode] = useState<Mode>(
    htmlOnly || (fluidHtml && bodyHtml)
      ? "html"
      : canBoth
        ? "both"
        : png
          ? "png"
          : "html",
  );
  const [copyOpen, setCopyOpen] = useState(false);
  const [fitScale, setFitScale] = useState(1);
  const [measuredH, setMeasuredH] = useState(fixedH);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const h = fluidHtml && mode !== "png" ? measuredH : fixedH;

  useEffect(() => {
    if (htmlOnly && bodyHtml) setMode("html");
    else if (pasteMode === "html" && bodyHtml) setMode("html");
    else if (canBoth) setMode("both");
    else if (png) setMode("png");
    else if (bodyHtml) setMode("html");
  }, [canBoth, png, bodyHtml, pasteMode, htmlOnly]);

  useEffect(() => {
    // Start from stored design height - never pad to 1200 (that left empty
    // canvas under landscape Canva cards until iframe measure corrected it,
    // and height:100% markup often prevented that correction).
    setMeasuredH(fixedH);
  }, [bodyHtml, fixedH, fluidHtml, versionKey]);

  // Width-fit for HTML emails; box-fit (W and H) for designer PNG/HTML.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    let timer = 0;
    const measure = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const cols = mode === "both" && canBoth ? 2 : 1;
        const gap = 20;
        const availW = Math.max(120, (el.clientWidth - gap * (cols - 1)) / cols);

        let next: number;
        if (fluidHtml && mode === "html") {
          // Fit width only - tall emails scroll vertically
          next = Math.min(1, availW / w);
        } else {
          const availH = Math.max(
            160,
            Math.min(window.innerHeight * 0.65, 820),
          );
          next = Math.min(1, availW / w, availH / h);
        }
        const rounded = Math.floor(next * 100) / 100;
        setFitScale((prev) => (Math.abs(prev - rounded) < 0.02 ? prev : rounded));
      }, 80);
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
  }, [w, h, mode, canBoth, fluidHtml]);

  const pngSrc = useMemo(() => {
    if (!png) return "";
    const join = png.includes("?") ? "&" : "?";
    const token = `${versionKey ?? 0}-${bodyHtml.length}`;
    return `${png}${join}v=${encodeURIComponent(token)}`;
  }, [png, versionKey, bodyHtml.length]);

  const htmlSrcDoc = useMemo(() => {
    if (!bodyHtml) return "";
    const head = extractEmailHeadInner(bodyHtml);
    const card = extractEmailBodyHtml(bodyHtml);
    const sizeCss = fluidHtml
      ? `html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: ${w}px !important;
    min-height: 0 !important;
    height: auto !important;
    overflow: hidden !important;
    background: ${EMAIL_PAPER_BG} !important;
  }
  body {
    font-family: Arial, Helvetica, sans-serif;
  }`
      : `html, body {
    margin: 0;
    padding: 0;
    width: ${w}px;
    height: ${fixedH}px;
    overflow: hidden;
    background: ${EMAIL_PAPER_BG} !important;
  }`;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=${w}"/>
${EMAIL_LIGHT_SCHEME_HEAD}
${head}
<style>
  ${emailLightSchemeCss()}
  ${sizeCss}
  .grat-canvas-stage { position: relative; }
  .grat-obj { position: absolute; box-sizing: border-box; }
  img { display: block; border: 0; }
  table { border-collapse: collapse; }
</style>
</head>
<body style="background:${EMAIL_PAPER_BG};">${card}</body>
</html>`;
  }, [bodyHtml, w, fixedH, fluidHtml]);

  function onHtmlFrameLoad(iframe: HTMLIFrameElement) {
    if (!fluidHtml) return;

    const syncHeight = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc?.body) return;
        const measured = measureEmailContentHeight(doc, iframe);
        const next = Math.min(8_000, Math.max(120, measured + 8));
        // Ignore absurd heights from a bad measure pass (keeps prior / design H).
        if (next >= 9000) return;
        setMeasuredH((prev) => (Math.abs(prev - next) < 4 ? prev : next));
        iframe.style.height = `${next}px`;
        iframe.style.overflow = "hidden";
        doc.documentElement.style.overflow = "hidden";
        doc.body.style.overflow = "hidden";
      } catch {
        /* opaque origin - keep estimate */
      }
    };

    syncHeight();
    // Re-measure after layout / late images (Canva assets).
    window.setTimeout(syncHeight, 50);
    window.setTimeout(syncHeight, 250);
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.querySelectorAll("img").forEach((img) => {
        if (!img.complete) img.addEventListener("load", syncHeight, { once: true });
      });
    } catch {
      /* ignore */
    }
  }

  const stageVars = {
    "--canvas-w": `${w}px`,
    "--canvas-h": `${h}px`,
    "--fit-scale": String(fitScale),
  } as CSSProperties;

  if (!png && !bodyHtml) return null;

  function renderStage(kind: "png" | "html", body: ReactNode) {
    return (
      <figure className="canvas-preview-stage">
        {!htmlOnly ? (
          <figcaption className="canvas-preview-caption">
            {kind === "png" ? "PNG" : "HTML"} · {w}×{h} ·{" "}
            {Math.round(fitScale * 100)}%
            {kind === "html" && fluidHtml ? " · width-fit" : ""}
          </figcaption>
        ) : null}
        <div
          className="canvas-preview-fit"
          style={{ width: w * fitScale, height: h * fitScale }}
        >
          <div
            className="canvas-preview-scale"
            style={{
              width: w,
              height: h,
              transform: `scale(${fitScale})`,
            }}
          >
            <div
              className={`canvas-preview-frame ${fluidHtml && kind === "html" ? "is-fluid" : ""}`}
            >
              {body}
            </div>
          </div>
        </div>
      </figure>
    );
  }

  return (
    <section className={`panel canvas-preview ${htmlOnly ? "is-simple" : ""}`}>
      {htmlOnly ? (
        <header className="canvas-preview-head canvas-preview-head--simple">
          <h2>Preview</h2>
          {bodyHtml || png ? (
            <button type="button" onClick={() => setCopyOpen(true)}>
              Copy for Outlook
            </button>
          ) : null}
        </header>
      ) : (
        <>
          <header className="canvas-preview-head">
            <div>
              <h2>Preview</h2>
              <p className="muted small tip">
                PNG and HTML use the same canvas size ({w}×{fixedH}px). After a
                canvas resize, Save & compile so both rebuild together.
              </p>
            </div>

            <div className="canvas-preview-meta" aria-label="Canvas dimensions">
              <label className="canvas-preview-dim">
                <span>Width</span>
                <span className="canvas-preview-dim-row">
                  <input
                    type="number"
                    value={w}
                    readOnly
                    aria-readonly="true"
                  />
                  <span className="canvas-preview-unit">px</span>
                </span>
              </label>
              <span className="canvas-preview-times" aria-hidden>
                ×
              </span>
              <label className="canvas-preview-dim">
                <span>Height</span>
                <span className="canvas-preview-dim-row">
                  <input
                    type="number"
                    value={h}
                    readOnly
                    aria-readonly="true"
                  />
                  <span className="canvas-preview-unit">px</span>
                </span>
              </label>
            </div>
          </header>

          <div className="canvas-preview-toolbar">
            <div className="outlook-zoom" role="group" aria-label="Preview mode">
              <span className="outlook-zoom-label">Show</span>
              <button
                type="button"
                className={`ghost small ${mode === "both" ? "active" : ""}`}
                disabled={!canBoth}
                onClick={() => setMode("both")}
              >
                Both
              </button>
              <button
                type="button"
                className={`ghost small ${mode === "png" ? "active" : ""}`}
                disabled={!png}
                onClick={() => setMode("png")}
              >
                PNG
              </button>
              <button
                type="button"
                className={`ghost small ${mode === "html" ? "active" : ""}`}
                disabled={!bodyHtml}
                onClick={() => setMode("html")}
              >
                HTML
              </button>
            </div>
            <span className="muted small">
              Width fit {Math.round(fitScale * 100)}%
            </span>
            {bodyHtml || png ? (
              <button type="button" onClick={() => setCopyOpen(true)}>
                Copy for Outlook
              </button>
            ) : null}
          </div>
        </>
      )}

      <div
        ref={hostRef}
        className={`canvas-preview-stages ${mode === "both" && !htmlOnly ? "is-both" : ""} ${fluidHtml && mode === "html" ? "is-html-scroll" : ""}`}
        style={stageVars}
      >
        {!htmlOnly && (mode === "png" || mode === "both") && png
          ? renderStage(
              "png",
              <img
                src={pngSrc}
                alt={`Canvas PNG ${w}×${fixedH}`}
                width={w}
                height={fixedH}
                className="canvas-preview-png"
              />,
            )
          : null}

        {(htmlOnly || mode === "html" || mode === "both") && bodyHtml
          ? renderStage(
              "html",
              <iframe
                title={`Email HTML ${w}×${h}`}
                className="canvas-preview-html"
                width={w}
                height={h}
                scrolling="no"
                sandbox="allow-same-origin"
                srcDoc={htmlSrcDoc}
                onLoad={(e) => onHtmlFrameLoad(e.currentTarget)}
              />,
            )
          : null}
      </div>

      {copyOpen && (bodyHtml || png) ? (
        <EmailBrowserCopyModal
          html={bodyHtml || "<div></div>"}
          pngUrl={pngSrc || null}
          designWidth={w}
          designHeight={h}
          pasteMode={pasteMode}
          offerHtmlPaste={offerHtmlPaste}
          onClose={() => setCopyOpen(false)}
        />
      ) : null}
    </section>
  );
}
