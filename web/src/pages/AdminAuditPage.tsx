import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AdminAuditEvent } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Breadcrumbs, emailsCrumb } from "../components/Breadcrumbs";
import { AdminSubNav } from "../components/AdminSubNav";
import {
  AUDIT_CATEGORIES,
  auditCategory,
  auditDetailRows,
  auditSummary,
  categoryLabel,
  formatRelativeTime,
  type AuditCategory,
} from "../lib/auditLabels";

export function AdminAuditPage() {
  const { token, user } = useAuth();
  const [events, setEvents] = useState<AdminAuditEvent[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<AuditCategory | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState<Record<string, boolean>>({});

  async function reload(search = q) {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminAudit(token, {
        q: search,
        take: 100,
      });
      setEvents(res.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(() => {
    if (!category) return events;
    return events.filter((e) => auditCategory(e.action) === category);
  }, [events, category]);

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
          { label: "Home", to: "/" },
          emailsCrumb,
          { label: "Admin", to: "/admin" },
          { label: "Audit log" },
        ]}
      />
      <AdminSubNav />
      <header className="page-header" data-tour="admin-audit">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Audit log</h1>
          <p className="lede">
            Activity history in plain language. Click a row for details.
          </p>
        </div>
      </header>

      <div className="marketplace-toolbar admin-audit-toolbar">
        <label className="marketplace-search">
          <span className="visually-hidden">Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void reload(q);
            }}
            placeholder="Search by person or what happened…"
          />
        </label>
        <label className="studio-select">
          <span className="visually-hidden">Category</span>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as AuditCategory | "")
            }
            aria-label="Filter by category"
          >
            {AUDIT_CATEGORIES.map((c) => (
              <option key={c.id || "all"} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void reload(q)}>
          Search
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading audit log…</p> : null}

      {!loading ? (
        <section className="panel">
          <div className="admin-people-wrap">
            <table className="audit-table admin-expand-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Category</th>
                  <th>What happened</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No audit events match.
                    </td>
                  </tr>
                ) : (
                  filtered.map((e) => {
                    const open = expandedId === e.id;
                    return (
                      <AuditRow
                        key={e.id}
                        event={e}
                        open={open}
                        showRaw={Boolean(showRaw[e.id])}
                        onToggleRaw={() =>
                          setShowRaw((prev) => ({
                            ...prev,
                            [e.id]: !prev[e.id],
                          }))
                        }
                        onToggle={() =>
                          setExpandedId(open ? null : e.id)
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

function AuditRow({
  event,
  open,
  showRaw,
  onToggle,
  onToggleRaw,
}: {
  event: AdminAuditEvent;
  open: boolean;
  showRaw: boolean;
  onToggle: () => void;
  onToggleRaw: () => void;
}) {
  const category = auditCategory(event.action);
  const details = auditDetailRows(event.payload);
  const absolute = new Date(event.createdAt).toLocaleString();

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
          <span title={absolute}>{formatRelativeTime(event.createdAt)}</span>
          <div className="muted small">{absolute}</div>
        </td>
        <td>
          {event.actor ? (
            <>
              <strong>{event.actor.displayName}</strong>
              <div className="muted small">{event.actor.email}</div>
            </>
          ) : (
            "-"
          )}
        </td>
        <td>
          <span className={`audit-cat-badge is-${category}`}>
            {categoryLabel(category)}
          </span>
        </td>
        <td>
          <div className="audit-summary">{auditSummary(event)}</div>
        </td>
      </tr>
      {open ? (
        <tr className="admin-expand-detail">
          <td colSpan={4}>
            <div className="admin-audit-detail">
              {details.length > 0 ? (
                <dl className="admin-audit-kv">
                  {details.map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="muted">No extra details for this event.</p>
              )}

              <button
                type="button"
                className="ghost small"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRaw();
                }}
              >
                {showRaw ? "Hide technical details" : "Show technical details"}
              </button>
              {showRaw ? (
                <pre className="admin-audit-payload">
                  {formatPayload({
                    action: event.action,
                    entityType: event.entityType,
                    entityId: event.entityId,
                    payload: event.payload,
                  })}
                </pre>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function formatPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload ?? {}, null, 2);
  } catch {
    return String(payload);
  }
}
