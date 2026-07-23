import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function AdminPage() {
  const { token, user } = useAuth();
  const [stats, setStats] = useState<{
    users: number;
    templates: number;
    drafts: number;
    audits: number;
  } | null>(null);
  const [events, setEvents] = useState<
    Array<{
      id: string;
      action: string;
      entityType: string;
      createdAt: string;
      actor: { displayName: string; email: string } | null;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([api.adminStats(token), api.adminAudit(token)])
      .then(([s, a]) => {
        setStats(s);
        setEvents(a.events);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load admin"),
      );
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
      <p className="back">
        <Link to="/">← Catalog</Link>
      </p>
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Oversight</h1>
          <p className="lede">Who did what, when — expand with send previews later.</p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {stats ? (
        <div className="stats-row">
          <div>
            <strong>{stats.users}</strong>
            <span>Users</span>
          </div>
          <div>
            <strong>{stats.templates}</strong>
            <span>Templates</span>
          </div>
          <div>
            <strong>{stats.drafts}</strong>
            <span>Drafts</span>
          </div>
          <div>
            <strong>{stats.audits}</strong>
            <span>Audit events</span>
          </div>
        </div>
      ) : null}

      <section className="panel">
        <h2>Recent audit</h2>
        <table className="audit-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Entity</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.createdAt).toLocaleString()}</td>
                <td>{e.actor?.displayName ?? "—"}</td>
                <td>{e.action}</td>
                <td>{e.entityType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
