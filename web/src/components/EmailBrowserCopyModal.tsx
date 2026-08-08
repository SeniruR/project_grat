import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  buildEmailDocument,
  buildOutlookPngEmailHtml,
  copyEmailHtmlForPaste,
  copyOutlookPngForPaste,
  isCanvasAbsoluteEmail,
  looksLikeAbsoluteEmail,
  looksLikeFragileEmailHtml,
} from "../lib/copyEmail";

export type OutlookPasteMode = "html" | "png" | "auto";

type Props = {
  html: string;
  /** Compiled PNG from Save & compile - used for PNG Outlook paste */
  pngUrl?: string | null;
  /** Designer canvas width - sizes the preview to match */
  designWidth?: number;
  /** Designer canvas height - sizes the preview to match */
  designHeight?: number;
  /**
   * How Copy for Outlook should paste:
   * - html: Canva / HTML import (selectable text)
   * - png: designer / image import
   * - auto: PNG when available for absolute canvas, else HTML
   */
  pasteMode?: OutlookPasteMode;
  /** Canva: optional HTML paste when PNG snapshot is the default */
  offerHtmlPaste?: boolean;
  onClose: () => void;
};

/**
 * Preview + copy for Outlook / Gmail paste.
 * Canva HTML uses HTML clipboard; image import uses PNG table.
 */
export function EmailBrowserCopyModal({
  html,
  pngUrl,
  designWidth = 600,
  designHeight = 800,
  pasteMode = "auto",
  offerHtmlPaste = false,
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

  const useHtmlPaste =
    pasteMode === "html" ||
    (pasteMode === "auto" &&
      !canOutlookPng &&
      !isCanvasAbs &&
      !isLegacyAbsolute);

  const outlookDoc = useMemo(() => {
    if (!png) return null;
    return buildOutlookPngEmailHtml({
      imageSrc: png,
      width: w,
      height: h,
    }).document;
  }, [png, w, h]);

  // Prefer HTML preview for selectable-HTML modes; PNG table otherwise.
  const previewDoc = useHtmlPaste
    ? buildEmailDocument(html)
    : (outlookDoc ?? buildEmailDocument(html));

  const [frameH, setFrameH] = useState(h);

  useEffect(() => {
    setFrameH(useHtmlPaste ? Math.max(h, 1200) : h);
  }, [html, png, pasteMode, h, useHtmlPaste]);

  useEffect(() => {
    setReady(false);
    setNotice(null);
    setError(null);
  }, [html, png, pasteMode]);

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
    let nextH = h;
    if (useHtmlPaste) {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          nextH = Math.min(
            12000,
            Math.max(
              400,
              Math.ceil(
                Math.max(
                  doc.body.scrollHeight,
                  doc.documentElement?.scrollHeight ?? 0,
                ) + 8,
              ),
            ),
          );
        }
      } catch {
        nextH = Math.max(h, 1200);
      }
    }
    setFrameH(nextH);
    iframe.style.width = `${w}px`;
    iframe.style.height = `${nextH}px`;
    iframe.style.minWidth = `${w}px`;
    iframe.style.minHeight = `${nextH}px`;
    iframe.style.maxHeight = "none";
  }

  async function copyForOutlook() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (useHtmlPaste) {
        if (!html.trim()) {
          throw new Error("Email HTML is empty. Import a Canva ZIP or paste HTML first.");
        }
        await copyEmailHtmlForPaste(html);
        setNotice(
          fragileHtml
            ? "Copied HTML. If Outlook shifts the header or fonts, that is Outlook’s Word engine ignoring modern CSS - try a simpler Canva layout or an image card for a fixed look."
            : "Copied HTML for Outlook - paste with Ctrl+V. Text should be selectable.",
        );
        return;
      }

      if (!png) {
        if (isCanvasAbs || isLegacyAbsolute) {
          throw new Error(
            "Outlook needs the compiled PNG. Open Designer → Save & compile, then try again.",
          );
        }
        await copyEmailHtmlForPaste(html);
        setNotice("Copied HTML - paste with Ctrl+V.");
        return;
      }
      await copyOutlookPngForPaste({
        pngUrl: png,
        width: w,
        height: h,
      });
      setNotice(
        "Copied card image for Outlook - paste with Ctrl+V. Layout and colors match your PNG preview.",
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

  async function copyHtmlSelectable() {
    if (!html.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await copyEmailHtmlForPaste(html);
      setNotice(
        "Copied HTML (selectable text). Outlook may still move header pieces - use PNG copy for a fixed look.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy failed.");
    } finally {
      setBusy(false);
    }
  }

  const fragileHtml = useHtmlPaste && looksLikeFragileEmailHtml(html);
  const showHtmlAlternate = offerHtmlPaste && canOutlookPng && html.trim();

  const helpText = useHtmlPaste ? (
    <>
      This card uses <strong>real email HTML</strong> (e.g. Canva import). Copy
      pastes HTML so recipients can select text.
      {fragileHtml ? (
        <>
          {" "}
          Outlook Desktop (Word) often <strong>moves or restyles</strong> pieces
          that rely on flex, absolute position, or web fonts - that is Outlook,
          not a bad copy. Browser preview can look fine while paste does not.
          For a pixel-perfect match, use an <strong>image upload</strong> card
          instead (text won’t be selectable).
        </>
      ) : null}
    </>
  ) : isLegacyAbsolute ? (
    <>
      This HTML looks like a <strong>legacy</strong> export. Open Designer →{" "}
      <strong>Save &amp; compile</strong> to refresh the PNG and canvas HTML.
    </>
  ) : canOutlookPng ? (
    <>
      {showHtmlAlternate ? (
        <>
          This copies your <strong>Canva snapshot (PNG)</strong> so Outlook paste
          matches the design. Use <strong>Copy HTML</strong> only if you need
          selectable text (layout may shift).
        </>
      ) : (
        <>
          Outlook Desktop cannot use absolute canvas HTML. This copies your{" "}
          <strong>compiled PNG</strong> as a simple email table ({w}×{h}px).
          Paste with Ctrl+V.
        </>
      )}
    </>
  ) : (
    <>
      No compiled PNG yet. Save &amp; compile in Designer first so Outlook paste
      keeps colors and layout.
    </>
  );

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
            "--copy-canvas-h": `${frameH}px`,
            width: `min(${w + 80}px, 96vw)`,
            maxWidth: "96vw",
          } as CSSProperties
        }
      >
        <h2 id="email-browser-copy-title">Copy for Outlook</h2>
        <p className="muted small">{helpText}</p>

        <div className="email-browser-frame-wrap">
          <iframe
            ref={iframeRef}
            title="Outlook paste preview"
            className={`email-browser-frame ${useHtmlPaste ? "is-fluid" : ""}`}
            width={w}
            height={frameH}
            sandbox="allow-same-origin"
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
            disabled={
              busy ||
              (useHtmlPaste ? !html.trim() : !canOutlookPng && !html.trim())
            }
            onClick={() => void copyForOutlook()}
          >
            {busy
              ? "Copying…"
              : useHtmlPaste
                ? "Copy for Outlook"
                : canOutlookPng
                  ? showHtmlAlternate
                    ? "Copy picture for Outlook"
                    : "Copy for Outlook"
                  : "Copy HTML"}
          </button>
          {showHtmlAlternate ? (
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => void copyHtmlSelectable()}
            >
              Copy HTML (selectable)
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
