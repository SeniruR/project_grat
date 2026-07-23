import { useMemo } from "react";

type Props = {
  html: string;
};

/** Approximate classic Outlook (Word) vs Outlook on the web for side-by-side checks. */
export function OutlookDualPreview({ html }: Props) {
  const safe = useMemo(() => html.trim(), [html]);
  if (!safe) return null;

  return (
    <section className="panel outlook-preview-panel">
      <h2>Preview</h2>
      <p className="muted small tip">
        Same HTML in both panes. Desktop approximates classic Outlook (Word), which
        ignores border-radius — so circles can look square and rounded frames look
        sharp. Web approximates Outlook on the web (full CSS). Scroll sideways if
        both cards don’t fit.
      </p>
      <div className="outlook-dual-scroll">
        <div className="outlook-dual">
          <article className="outlook-pane">
            <header className="outlook-pane-head">
              <span className="outlook-pane-label">Outlook Desktop</span>
              <span className="outlook-pane-meta">Word engine</span>
            </header>
            <div className="outlook-pane-body">
              <div
                className="email-preview outlook-desktop-sim"
                dangerouslySetInnerHTML={{ __html: safe }}
              />
            </div>
          </article>
          <article className="outlook-pane">
            <header className="outlook-pane-head">
              <span className="outlook-pane-label">Outlook Web</span>
              <span className="outlook-pane-meta">Browser engine</span>
            </header>
            <div className="outlook-pane-body">
              <div
                className="email-preview outlook-web-sim"
                dangerouslySetInnerHTML={{ __html: safe }}
              />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
