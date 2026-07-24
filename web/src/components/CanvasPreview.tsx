import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { extractEmailBodyHtml } from "../designer/compile";
import { EmailBrowserCopyModal } from "./EmailBrowserCopyModal";

type Props = {
  /** Designer canvas width (px) */
  width: number;
  /** Designer canvas height (px) */
  height: number;
  /** 1:1 PNG snapshot from Save & compile */
  pngUrl?: string | null;
  /** Compiled email HTML */
  html?: string;
  /** Cache-bust token when version changes */
  versionKey?: string | number;
};

type Mode = "png" | "html" | "both";

/**
 * Side-by-side PNG + HTML preview at identical canvas W×H.
 * One shared fit-scale keeps both panes the same visual size.
 */
export function CanvasPreview({
  width,
  height,
  pngUrl,
  html,
  versionKey,
}: Props) {
  const w = Math.max(200, Math.round(width) || 600);
  const h = Math.max(200, Math.round(height) || 800);
  const png = (pngUrl ?? "").trim();
  const bodyHtml = (html ?? "").trim();

  const canBoth = Boolean(png && bodyHtml);
  const [mode, setMode] = useState<Mode>(canBoth ? "both" : png ? "png" : "html");
  const [copyOpen, setCopyOpen] = useState(false);
  const [fitScale, setFitScale] = useState(1);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (canBoth) setMode("both");
    else if (png) setMode("png");
    else if (bodyHtml) setMode("html");
  }, [canBoth, png, bodyHtml]);

  // Shared fit scale for every visible stage (same for PNG and HTML).
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
        const availH = Math.max(160, Math.min(window.innerHeight * 0.65, 820));
        const next = Math.min(1, availW / w, availH / h);
        const rounded = Math.round(next * 100) / 100;
        setFitScale((prev) => (Math.abs(prev - rounded) < 0.01 ? prev : rounded));
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
  }, [w, h, mode, canBoth]);

  const pngSrc = useMemo(() => {
    if (!png) return "";
    const join = png.includes("?") ? "&" : "?";
    // Bust cache when version OR html body changes (same URL overwritten on compile)
    const token = `${versionKey ?? 0}-${bodyHtml.length}`;
    return `${png}${join}v=${encodeURIComponent(token)}`;
  }, [png, versionKey, bodyHtml.length]);

  /** Fixed W×H document — keep object px coords from compile (match PNG). */
  const htmlSrcDoc = useMemo(() => {
    if (!bodyHtml) return "";
    const card = extractEmailBodyHtml(bodyHtml);
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=${w}"/>
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: ${w}px;
    height: ${h}px;
    overflow: hidden;
    background: #ffffff;
  }
  .grat-canvas-stage { position: relative; }
  .grat-obj { position: absolute; box-sizing: border-box; }
  img { display: block; border: 0; }
  table { border-collapse: collapse; }
</style>
</head>
<body>${card}</body>
</html>`;
  }, [bodyHtml, w, h]);

  const stageVars = {
    "--canvas-w": `${w}px`,
    "--canvas-h": `${h}px`,
    "--fit-scale": String(fitScale),
  } as CSSProperties;

  if (!png && !bodyHtml) return null;

  function renderStage(kind: "png" | "html", body: ReactNode) {
    return (
      <figure className="canvas-preview-stage">
        <figcaption className="canvas-preview-caption">
          {kind === "png" ? "PNG" : "HTML"} · {w}×{h} · {Math.round(fitScale * 100)}%
        </figcaption>
        {/* Outer shell = scaled visual size; inner = true canvas pixels */}
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
            <div className="canvas-preview-frame">{body}</div>
          </div>
        </div>
      </figure>
    );
  }

  return (
    <section className="panel canvas-preview">
      <header className="canvas-preview-head">
        <div>
          <h2>Preview</h2>
          <p className="muted small tip">
            PNG and HTML use the same canvas size ({w}×{h}px) and fit scale.
            After a canvas resize, Save &amp; compile so both rebuild together.
          </p>
        </div>

        <div className="canvas-preview-meta" aria-label="Canvas dimensions">
          <label className="canvas-preview-dim">
            <span>Width</span>
            <span className="canvas-preview-dim-row">
              <input type="number" value={w} readOnly aria-readonly="true" />
              <span className="canvas-preview-unit">px</span>
            </span>
          </label>
          <span className="canvas-preview-times" aria-hidden>
            ×
          </span>
          <label className="canvas-preview-dim">
            <span>Height</span>
            <span className="canvas-preview-dim-row">
              <input type="number" value={h} readOnly aria-readonly="true" />
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
        <span className="muted small">Fit {Math.round(fitScale * 100)}%</span>
        {bodyHtml || png ? (
          <button type="button" onClick={() => setCopyOpen(true)}>
            Copy for Outlook
          </button>
        ) : null}
      </div>

      <div
        ref={hostRef}
        className={`canvas-preview-stages ${mode === "both" ? "is-both" : ""}`}
        style={stageVars}
      >
        {(mode === "png" || mode === "both") && png
          ? renderStage(
              "png",
              <img
                src={pngSrc}
                alt={`Canvas PNG ${w}×${h}`}
                width={w}
                height={h}
                className="canvas-preview-png"
              />,
            )
          : null}

        {(mode === "html" || mode === "both") && bodyHtml
          ? renderStage(
              "html",
              <iframe
                title={`Email HTML ${w}×${h}`}
                className="canvas-preview-html"
                width={w}
                height={h}
                sandbox=""
                srcDoc={htmlSrcDoc}
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
          onClose={() => setCopyOpen(false)}
        />
      ) : null}
    </section>
  );
}
