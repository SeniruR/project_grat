import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Breadcrumbs, emailsCrumb } from "../components/Breadcrumbs";

/** Admin hub — stats + links to Summary, People, Audit. */
export function AdminPage() {
  const { token, user } = useAuth();
  const [stats, setStats] = useState<{
    users: number;
    templates: number;
    drafts: number;
    audits: number;
    designers?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .adminStats(token)
      .then(setStats)
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
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          emailsCrumb,
          { label: "Admin Panel" },
        ]}
      />
      <header className="page-header">
        <div>
          <p className="eyebrow">Emails</p>
          <h1>Admin Panel</h1>
          <p className="lede">
            Review send activity, manage people and roles, and inspect the audit
            log.
          </p>
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
            <strong>{stats.designers ?? "—"}</strong>
            <span>Designers</span>
          </div>
          <div>
            <strong>{stats.templates}</strong>
            <span>Templates</span>
          </div>
          <div>
            <strong>{stats.drafts}</strong>
            <span>Sends</span>
          </div>
          <div>
            <strong>{stats.audits}</strong>
            <span>Audit events</span>
          </div>
        </div>
      ) : (
        <p className="muted">Loading stats…</p>
      )}

      <div className="catalog-grid">
        <Link to="/admin/summary" className="catalog-tile catalog-tile--live">
          <span className="catalog-type">SUMMARY</span>
          <h2>Send summary</h2>
          <p>See what each user has sent — jobs, message counts, and recent cards.</p>
        </Link>
        <Link to="/admin/people" className="catalog-tile catalog-tile--live">
          <span className="catalog-type">PEOPLE</span>
          <h2>People</h2>
          <p>Assign Admin, Designer, or User roles and remove unused accounts.</p>
        </Link>
        <Link to="/admin/settings" className="catalog-tile catalog-tile--live">
          <span className="catalog-type">SETTINGS</span>
          <h2>Compose settings</h2>
          <p>
            Choose which name titles (Mr., Mrs., Sir, …) appear in Compose
            dropdowns.
          </p>
        </Link>
        <Link to="/admin/audit" className="catalog-tile catalog-tile--live">
          <span className="catalog-type">AUDIT</span>
          <h2>Audit log</h2>
          <p>Browse detailed events — expand a row to inspect the payload.</p>
        </Link>
      </div>
    </div>
  );
}
