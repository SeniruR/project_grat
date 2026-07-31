import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { roleLabel } from "../lib/roles";
import { Breadcrumbs, emailsCrumb } from "../components/Breadcrumbs";

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: "USER" | "DESIGNER" | "ADMIN";
  isDirectory: boolean;
  createdAt: string;
  _count: { ownedTemplates: number; draftJobs: number };
};

export function AdminPage() {
  const { token, user } = useAuth();
  const [stats, setStats] = useState<{
    users: number;
    templates: number;
    drafts: number;
    audits: number;
    designers?: number;
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
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  function canDeleteUser(u: AdminUser) {
    return (
      u.role !== "ADMIN" &&
      u._count.ownedTemplates === 0 &&
      u._count.draftJobs === 0 &&
      u.id !== user?.id
    );
  }

  async function reload() {
    if (!token) return;
    const [s, a, u] = await Promise.all([
      api.adminStats(token),
      api.adminAudit(token),
      api.adminUsers(token),
    ]);
    setStats(s);
    setEvents(a.events);
    setUsers(u.users);
  }

  useEffect(() => {
    if (!token) return;
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load admin"),
    );
  }, [token]);

  async function changeRole(
    id: string,
    role: "USER" | "DESIGNER" | "ADMIN",
  ) {
    if (!token) return;
    setSavingId(id);
    setError(null);
    setNotice(null);
    try {
      await api.adminUpdateUser(token, id, { role });
      await reload();
      setNotice(`Updated role to ${roleLabel(role)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Role update failed");
    } finally {
      setSavingId(null);
    }
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await api.adminDeleteUser(token, deleteTarget.id);
      setNotice(`Deleted ${deleteTarget.displayName}.`);
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

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
            Assign Admin, Designer, or User roles. Designers manage templates;
            users browse Templates and send.
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

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
        </div>
      ) : null}

      <section className="panel">
        <h2>People</h2>
        <div className="admin-people-wrap">
        <table className="audit-table admin-people-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Templates</th>
              <th>Jobs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.displayName}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    className="admin-role-select"
                    value={u.role}
                    disabled={savingId === u.id || deleting}
                    onChange={(e) =>
                      void changeRole(
                        u.id,
                        e.target.value as "USER" | "DESIGNER" | "ADMIN",
                      )
                    }
                  >
                    <option value="USER">User</option>
                    <option value="DESIGNER">Designer</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td>{u._count.ownedTemplates}</td>
                <td>{u._count.draftJobs}</td>
                <td className="admin-user-actions">
                  {canDeleteUser(u) ? (
                    <button
                      type="button"
                      className="linkish danger-text"
                      disabled={savingId === u.id || deleting}
                      onClick={() => setDeleteTarget(u)}
                    >
                      Delete
                    </button>
                  ) : (
                    <span className="muted small">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {deleteTarget ? (
        <div
          className="app-modal-backdrop"
          role="presentation"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="app-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Delete user?</h2>
            <p>
              Remove <strong>{deleteTarget.displayName}</strong> (
              {deleteTarget.email})? They have no templates or send jobs.
            </p>
            <div className="app-modal-actions">
              <button
                type="button"
                className="ghost"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
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
