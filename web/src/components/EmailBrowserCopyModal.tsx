import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  buildEmailDocument,
  buildOutlookPngEmailHtml,
  copyEmailHtmlForPaste,
  copyHtmlSource,
  copyOutlookPngForPaste,
  isCanvasAbsoluteEmail,
  looksLikeAbsoluteEmail,
} from "../lib/copyEmail";

type Props = {
  html: string;
  /** Compiled PNG from Save & compile — required for Outlook Desktop paste */
  pngUrl?: string | null;
  /** Designer canvas width — sizes the preview to match */
  designWidth?: number;
  /** Designer canvas height — sizes the preview to match */
  designHeight?: number;
  onClose: () => void;
};

/**
 * Preview + copy for Outlook / Gmail paste.
 * In-app preview keeps absolute canvas HTML; Outlook paste uses the PNG
 * (Word ignores position:absolute / div backgrounds).
 */
export function EmailBrowserCopyModal({
  html,
  pngUrl,
  designWidth = 600,
  designHeight = 800,
  onClose,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const w = Math.max(200, Math.round(designWidth));
  const h = Math.max(200, Math.round(designHeight));
  const png = (pngUrl ?? "").trim();
  const isLegacyAbsolute = looksLikeAbsoluteEmail(html);
  const isCanvasAbs = isCanvasAbsoluteEmail(html);
  const canOutlookPng = Boolean(png);

  const outlookDoc = useMemo(() => {
    if (!png) return null;
    return buildOutlookPngEmailHtml({
      imageSrc: png,
      width: w,
      height: h,
    }).document;
  }, [png, w, h]);

  // Modal preview shows what will paste into Outlook (PNG table), falling
  // back to absolute HTML only when no PNG exists.
  const previewDoc = outlookDoc ?? buildEmailDocument(html);

  useEffect(() => {
    setReady(false);
    setNotice(null);
    setError(null);
  }, [html, png]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function sizeIframe() {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.style.width = `${w}px`;
    iframe.style.height = `${h}px`;
    iframe.style.minWidth = `${w}px`;
    iframe.style.minHeight = `${h}px`;
  }

  async function copyForOutlook() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!png) {
        if (isCanvasAbs || isLegacyAbsolute) {
          throw new Error(
            "Outlook needs the compiled PNG. Open Designer → Save & compile, then try again.",
          );
        }
        await copyEmailHtmlForPaste(html);
        setNotice("Copied HTML — paste with Ctrl+V.");
        return;
      }
      await copyOutlookPngForPaste({
        pngUrl: png,
        width: w,
        height: h,
      });
      setNotice(
        "Copied card image for Outlook — paste with Ctrl+V. Layout and colors match your PNG preview.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Copy failed. Try Save & compile again, then retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copySource() {
    if (!html.trim()) {
      setError("Email HTML is empty. Save & compile in Designer first.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await copyHtmlSource(html);
      setNotice(
        "HTML source copied (for debugging). For Outlook Desktop paste, use Copy for Outlook.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="app-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="app-modal email-browser-copy-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-browser-copy-title"
        onClick={(e) => e.stopPropagation()}
        style={
          {
            "--copy-canvas-w": `${w}px`,
            "--copy-canvas-h": `${h}px`,
            width: `min(${w + 80}px, 96vw)`,
            maxWidth: "96vw",
          } as CSSProperties
        }
      >
        <h2 id="email-browser-copy-title">Copy for Outlook</h2>
        <p className="muted small">
          {isLegacyAbsolute ? (
            <>
              This HTML looks like a <strong>legacy</strong> export. Open
              Designer → <strong>Save &amp; compile</strong> to refresh the PNG
              and canvas HTML.
            </>
          ) : canOutlookPng ? (
            <>
              Outlook Desktop cannot use absolute canvas HTML. This copies your{" "}
              <strong>compiled PNG</strong> as a simple email table ({w}×{h}
              px). Paste with Ctrl+V.
            </>
          ) : (
            <>
              No compiled PNG yet. Save &amp; compile in Designer first so
              Outlook paste keeps colors and layout.
            </>
          )}
        </p>

        <div className="email-browser-frame-wrap">
          <iframe
            ref={iframeRef}
            title="Outlook paste preview"
            className="email-browser-frame"
            width={w}
            height={h}
            srcDoc={previewDoc}
            onLoad={() => {
              sizeIframe();
              setReady(true);
            }}
          />
        </div>

        {notice ? <p className="notice">{notice}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <div className="app-modal-actions">
          <button
            type="button"
            disabled={busy || (!canOutlookPng && !html.trim())}
            onClick={() => void copyForOutlook()}
          >
            {busy
              ? "Copying…"
              : canOutlookPng
                ? "Copy for Outlook"
                : "Copy HTML"}
          </button>
          {html.trim() ? (
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => void copySource()}
            >
              Copy HTML source
            </button>
          ) : null}
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {!ready ? <p className="muted small">Loading preview…</p> : null}
      </div>
    </div>
  );
}
