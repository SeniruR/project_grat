import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { buildEmailDocument } from "../lib/copyEmail";
import {
  inferEmailWidth,
  measureEmailContentHeight,
} from "../lib/rasterizeEmailHtml";
import { rewriteMediaUrlsInHtml } from "../lib/mediaUrl";
import type { SentItem } from "../api/client";

type Props = {
  item: SentItem;
  onClose: () => void;
};

/**
 * Popup preview for a sent email. Portaled to document.body so page
 * animations/transforms cannot trap position:fixed off-screen.
 */
export function SentPreviewModal({ item, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [contentH, setContentH] = useState(800);

  const designW = useMemo(
    () => inferEmailWidth(item.bodyHtml ?? "", 600),
    [item.bodyHtml],
  );

  const srcDoc = useMemo(() => {
    const html = rewriteMediaUrlsInHtml((item.bodyHtml ?? "").trim());
    if (!html) return "";
    const doc = buildEmailDocument(html);
    return doc.replace(
      /<\/head>/i,
      `<style>
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: ${designW}px !important;
          min-height: 0 !important;
          height: auto !important;
          overflow: hidden !important;
          background: #ffffff;
        }
        img { display: block; border: 0; max-width: 100%; }
      </style></head>`,
    );
  }, [item.bodyHtml, designW]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let timer = 0;
    const measure = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const avail = Math.max(200, el.clientWidth - 8);
        const next = Math.min(1.35, Math.max(0.35, avail / designW));
        const rounded = Math.round(next * 100) / 100;
        setFitScale((prev) => (Math.abs(prev - rounded) < 0.01 ? prev : rounded));
      }, 60);
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [designW, srcDoc]);

  function onFrameLoad(iframe: HTMLIFrameElement) {
    iframeRef.current = iframe;
    const sync = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc?.body) return;
        const measured = measureEmailContentHeight(doc, iframe);
        const next = Math.min(12_000, Math.max(120, measured + 2));
        setContentH(next);
        iframe.style.height = `${next}px`;
        iframe.style.width = `${designW}px`;
      } catch {
        /* ignore */
      }
    };
    sync();
    window.setTimeout(sync, 80);
    window.setTimeout(sync, 300);
    try {
      iframe.contentDocument?.querySelectorAll("img").forEach((img) => {
        if (!img.complete) img.addEventListener("load", sync, { once: true });
      });
    } catch {
      /* ignore */
    }
  }

  return createPortal(
    <div
      className="app-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="app-modal sent-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sent-preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sent-preview-modal-head">
          <div>
            <p className="eyebrow">Sent preview</p>
            <h2 id="sent-preview-title">{item.subject}</h2>
            <p className="muted small">
              To {item.recipientName || "-"} &lt;{item.recipientEmail}&gt; ·{" "}
              {item.job.template.name} ·{" "}
              {new Date(item.createdAt).toLocaleString()} ·{" "}
              <Link to={`/drafts/${item.job.id}`}>Open job</Link>
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>

        {item.error ? <p className="error">{item.error}</p> : null}

        {!srcDoc ? (
          <p className="muted">No HTML preview stored for this send.</p>
        ) : (
          <div ref={hostRef} className="sent-preview-scroll">
            <div
              className="sent-preview-fit"
              style={{
                width: designW * fitScale,
                height: contentH * fitScale,
              }}
            >
              <div
                className="sent-preview-scale"
                style={{
                  width: designW,
                  height: contentH,
                  transform: `scale(${fitScale})`,
                }}
              >
                <iframe
                  title={`Preview ${item.subject}`}
                  className="sent-preview-iframe"
                  sandbox="allow-same-origin"
                  srcDoc={srcDoc}
                  onLoad={(e) => onFrameLoad(e.currentTarget)}
                  style={{ width: designW, height: contentH }}
                />
              </div>
            </div>
          </div>
        )}

        <p className="muted small sent-preview-meta">
          Width-fit {Math.round(fitScale * 100)}% · design {designW}px · scroll
          for full height
        </p>
      </div>
    </div>,
    document.body,
  );
}
