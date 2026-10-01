import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type DraftJobDetail } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { OutlookDualPreview } from "../components/OutlookDualPreview";
import { COMPOSE_ENABLED } from "../features";
import { Breadcrumbs, cardsCrumb } from "../components/Breadcrumbs";

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

  const failCount = job.drafts.filter((d) => d.status === "failed").length;

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          cardsCrumb,
          { label: "Prepare", to: `/cards/${job.template.id}/compose` },
          { label: "Preview" },
        ]}
      />
      <header className="page-header page-header-row gift-on-way">
        <div>
          <h1>Card sent</h1>
          <p className="lede">
            Below is the list of people who will receive the card you sent.
            {failCount
              ? ` ${failCount} could not be sent.`
              : ""}
          </p>
        </div>
        {COMPOSE_ENABLED ? (
          <div className="header-actions">
            <Link className="btn-link" to={`/cards/${job.template.id}/compose`}>
              Send again
            </Link>
          </div>
        ) : null}
      </header>

      {error ? <p className="error">{error}</p> : null}

      {mailMode === "smtp" ? (
        <p className="notice">
          
        </p>
      ) : mailMode === "graph" ? (
        <p className="notice">
          Microsoft 365 mail. A work-account sign-in sends each card from that
          mailbox. Older jobs may still be Outlook drafts.
        </p>
      ) : null}

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
                  <span className="muted small">{open ? "Hide preview" : "Show preview"}</span>
                </div>
              </button>
              {open ? (
                <div className="draft-card-body">
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
                      <OutlookDualPreview
                        html={d.bodyHtml}
                        subject={d.subject}
                        showCopyActions={false}
                        embedded
                      />
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
