import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AdminSendSummaryUser } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { roleLabel } from "../lib/roles";
import { Breadcrumbs, emailsCrumb, adminCrumb } from "../components/Breadcrumbs";
import { AdminSubNav } from "../components/AdminSubNav";
import { COMPOSE_ENABLED } from "../features";

export function AdminSendSummaryPage() {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<AdminSendSummaryUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .adminSendSummary(token)
      .then((res) => setRows(res.users))
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Failed to load send summary",
        ),
      )
      .finally(() => setLoading(false));
  }, [token]);

  if (user?.role !== "ADMIN") {
    return (
      <div className="page">
        <p className="error">Admin access required.</p>
        <Link to="/">Back</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          emailsCrumb,
          adminCrumb,
          { label: "Send summary" },
        ]}
      />
      <AdminSubNav />
      <header className="page-header" data-tour="admin-summary">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Send summary</h1>
          <p className="lede">
            Per-user outbound activity. Click a row to see every job and email -
            same coverage as Sent for that user.
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading summary…</p> : null}

      {!loading ? (
        <section className="panel">
          <div className="admin-people-wrap">
            <table className="audit-table admin-expand-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Jobs</th>
                  <th>Messages</th>
                  <th>Last send</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No users yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const open = expandedId === row.id;
                    return (
                      <SummaryRow
                        key={row.id}
                        row={row}
                        open={open}
                        onToggle={() =>
                          setExpandedId(open ? null : row.id)
                        }
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SummaryRow({
  row,
  open,
  onToggle,
}: {
  row: AdminSendSummaryUser;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={`admin-expand-row ${open ? "is-open" : ""}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        aria-expanded={open}
      >
        <td>
          <strong>{row.displayName}</strong>
          <div className="muted small">{row.email}</div>
        </td>
        <td>{roleLabel(row.role)}</td>
        <td>{row.jobCount}</td>
        <td>{row.messageCount}</td>
        <td>
          {row.lastSentAt
            ? new Date(row.lastSentAt).toLocaleString()
            : "-"}
        </td>
      </tr>
      {open ? (
        <tr className="admin-expand-detail">
          <td colSpan={5}>
            {row.recentJobs.length === 0 ? (
              <p className="muted small">No send jobs for this user.</p>
            ) : (
              <ul className="admin-job-list">
                {row.recentJobs.map((job) => (
                  <li key={job.id}>
                    <div className="admin-job-list-head">
                      <div>
                        <strong>{job.templateName}</strong>
                        {job.categoryName ? (
                          <span className="muted"> · {job.categoryName}</span>
                        ) : null}
                        <div className="muted small">
                          {job.messageCount} message
                          {job.messageCount === 1 ? "" : "s"} · {job.status} ·{" "}
                          {new Date(job.createdAt).toLocaleString()}
                        </div>
                      </div>
                      {COMPOSE_ENABLED ? (
                        <Link
                          className="small"
                          to={`/drafts/${job.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open job
                        </Link>
                      ) : null}
                    </div>
                    {(job.messages?.length ?? 0) > 0 ? (
                      <ul className="admin-message-list">
                        {job.messages?.map((m) => (
                          <li key={m.id}>
                            <strong>{m.subject}</strong>
                            <div className="muted small">
                              → {m.recipientName || m.recipientEmail}
                              {" · "}
                              {m.status}
                              {" · "}
                              {new Date(m.createdAt).toLocaleString()}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
