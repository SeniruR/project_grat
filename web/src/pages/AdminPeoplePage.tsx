import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { roleLabel } from "../lib/roles";
import { Breadcrumbs, emailsCrumb, adminCrumb } from "../components/Breadcrumbs";
import { AdminSubNav } from "../components/AdminSubNav";
import { ToastBanner } from "../components/ToastBanner";

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: "USER" | "DESIGNER" | "ADMIN";
  isDirectory: boolean;
  createdAt: string;
  _count: { ownedTemplates: number; draftJobs: number };
};

type RoleName = "USER" | "DESIGNER" | "ADMIN";

type RoleUndo = { id: string; role: RoleName };

export function AdminPeoplePage() {
  const { token, user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undoRole, setUndoRole] = useState<RoleUndo | null>(null);
  const [roleChange, setRoleChange] = useState<{
    person: AdminUser;
    next: RoleName;
  } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const dismissNotice = useCallback(() => {
    setNotice(null);
    setUndoRole(null);
  }, []);

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
    const u = await api.adminUsers(token);
    setUsers(u.users);
  }

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    reload()
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load people"),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function changeRole(
    id: string,
    role: RoleName,
    opts?: { notice?: string; undo?: RoleUndo | null },
  ) {
    if (!token) return false;
    setSavingId(id);
    setError(null);
    try {
      await api.adminUpdateUser(token, id, { role });
      await reload();
      if (opts && "undo" in opts) setUndoRole(opts.undo ?? null);
      else setUndoRole(null);
      setNotice(opts?.notice ?? null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Role update failed");
      return false;
    } finally {
      setSavingId(null);
    }
  }

  function askRoleChange(person: AdminUser, next: RoleName) {
    if (next === person.role) return;
    setRoleChange({ person, next });
  }

  async function confirmRoleChange() {
    if (!roleChange) return;
    const { person, next } = roleChange;
    setRoleChange(null);
    await changeRole(person.id, next, {
      notice: `Updated ${person.displayName} to ${roleLabel(next)}.`,
      undo: { id: person.id, role: person.role },
    });
  }

  async function undoRoleChange() {
    if (!undoRole) return;
    await changeRole(undoRole.id, undoRole.role);
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await api.adminDeleteUser(token, deleteTarget.id);
      setUndoRole(null);
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
          emailsCrumb,
          adminCrumb,
          { label: "People" },
        ]}
      />
      <AdminSubNav />
      <header className="page-header" data-tour="admin-people">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>People</h1>
          <p className="lede">
            Assign Admin, Designer, or User roles. Designers manage cards;
            users browse and share.
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      <ToastBanner
        message={notice}
        onClose={dismissNotice}
        variant="info"
        durationMs={7000}
        actionLabel={undoRole ? "Undo" : undefined}
        onAction={undoRole ? () => void undoRoleChange() : undefined}
      />
      {loading ? <p className="muted">Loading people…</p> : null}

      {!loading ? (
        <section className="panel">
          <h2>Directory</h2>
          <div className="admin-people-wrap">
            <table className="audit-table admin-people-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Cards</th>
                  <th>Shares</th>
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
                          askRoleChange(
                            u,
                            e.target.value as RoleName,
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
                        <span className="muted small">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {roleChange
        ? createPortal(
            <div
              className="app-modal-backdrop"
              role="presentation"
              onClick={() => !savingId && setRoleChange(null)}
            >
              <div
                className="app-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="role-change-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="role-change-title">Change role?</h2>
                <p>
                  Change <strong>{roleChange.person.displayName}</strong> from{" "}
                  {roleLabel(roleChange.person.role)} to{" "}
                  {roleLabel(roleChange.next)}?
                </p>
                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="ghost"
                    disabled={Boolean(savingId)}
                    onClick={() => setRoleChange(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(savingId)}
                    onClick={() => void confirmRoleChange()}
                  >
                    {savingId ? "Saving…" : "Change role"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {deleteTarget
        ? createPortal(
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
                  {deleteTarget.email})? They have no designs or shares.
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
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
