import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type DraftJobDetail } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { OutlookDualPreview } from "../components/OutlookDualPreview";
import { COMPOSE_ENABLED } from "../features";
import { Breadcrumbs, emailsCrumb, historyCrumb } from "../components/Breadcrumbs";

export function DraftJobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { token } = useAuth();
  const [job, setJob] = useState<DraftJobDetail | null>(null);
  const [mailMode, setMailMode] = useState("mock");
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !jobId) return;
    api
      .draftJob(token, jobId)
      .then((res) => {
        setJob(res.job);
        setMailMode(res.mailMode);
        const firstOk = res.job.drafts.find((d) => d.bodyHtml);
        if (firstOk) setOpenId(firstOk.id);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load job"),
      );
  }, [token, jobId]);

  if (!job && !error) {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link to="/cards">Back to cards</Link>
      </div>
    );
  }

  const okCount = job.drafts.filter((d) => d.status !== "failed").length;
  const failCount = job.drafts.length - okCount;
  const names = job.drafts
    .filter((d) => d.status !== "failed")
    .map((d) => d.recipientName ?? d.recipientEmail);
  const forLine =
    names.length === 0
      ? "Your card is on its way."
      : names.length === 1
        ? `On its way to ${names[0]}.`
        : names.length === 2
          ? `On its way to ${names[0]} and ${names[1]}.`
          : `On its way to ${names[0]} and ${names.length - 1} others.`;

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          emailsCrumb,
          historyCrumb,
          { label: job.template.name },
        ]}
      />
      {COMPOSE_ENABLED ? (
        <p className="back">
          <Link to={`/cards/${job.template.id}/compose`}>Send again</Link>
        </p>
      ) : null}
      <header className="page-header gift-on-way">
        <div>
          <h1>It’s on its way.</h1>
          <p className="lede">
            {forLine} {job.template.name}
            {failCount ? ` · ${failCount} could not be sent.` : ""}
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {mailMode === "mock" ? (
        <p className="notice">
          Mock mode - drafts are stored here only. Set{" "}
          <code>MAIL_MODE=smtp</code> (Gmail) or <code>MAIL_MODE=graph</code> in{" "}
          <code>api/.env</code> to send for real.
        </p>
      ) : mailMode === "smtp" ? (
        <p className="notice">
          SMTP mode - messages were sent with images embedded in the email (not
          linked from localhost). Check the recipient inbox.
        </p>
      ) : (
        <p className="notice">
          Graph mode - drafts were created in Outlook (mailbox from the signed-in
          user email, or <code>GRAPH_MAILBOX_UPN</code>).
        </p>
      )}

      <ul className="draft-list">
        {job.drafts.map((d) => {
          const open = openId === d.id;
          return (
            <li key={d.id} className="panel draft-card">
              <button
                type="button"
                className="draft-card-head"
                onClick={() => setOpenId(open ? null : d.id)}
              >
                <div>
                  <strong>{d.recipientName ?? d.recipientEmail}</strong>
                  <span className="meta">{d.recipientEmail}</span>
                </div>
                <div className="draft-card-meta">
                  <span className={`draft-status draft-status--${d.status}`}>
                    {d.status}
                  </span>
                  <span className="muted small">{open ? "Hide" : "Show"}</span>
                </div>
              </button>
              {open ? (
                <div className="draft-card-body">
                  <p>
                    <strong>Subject:</strong> {d.subject}
                  </p>
                  {d.error ? <p className="error">{d.error}</p> : null}
                  {d.bodyHtml ? (
                    <>
                      {/\bcid:/i.test(d.bodyHtml) ? (
                        <p className="notice">
                          This older send stored embedded <code>cid:</code>{" "}
                          image links, which browsers can’t display here. Images
                          may still have arrived in the real inbox. New sends
                          keep a normal preview.
                        </p>
                      ) : null}
                      <OutlookDualPreview html={d.bodyHtml} />
                    </>
                  ) : (
                    <p className="muted">No HTML stored for this draft.</p>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
