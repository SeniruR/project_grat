import { useEffect, useState } from "react";
import { api, type TemplateCategory } from "../api/client";

type Props = {
  token: string;
  currentUserId: string;
  /** When set, render as a dialog body (caller supplies the modal shell). */
  onClose?: () => void;
};

type StatusKind = "success" | "deleted" | "rejected";

/**
 * Manage categories you created: rename or delete (delete only when unused).
 * Other designers’ categories are listed read-only.
 */
export function CategoryManagePanel({
  token,
  currentUserId,
  onClose,
}: Props) {
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [status, setStatus] = useState<StatusKind | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  async function reload() {
    const res = await api.categories(token);
    setCategories(res.categories);
    const next: Record<string, string> = {};
    for (const c of res.categories) next[c.id] = c.name;
    setDrafts(next);
  }

  useEffect(() => {
    reload().catch(() => setStatus("rejected"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const mine = categories.filter((c) => c.createdBy?.id === currentUserId);
  const others = categories.filter((c) => c.createdBy?.id !== currentUserId);

  async function saveRename(cat: TemplateCategory) {
    const name = (drafts[cat.id] ?? "").trim();
    if (!name || name === cat.name) return;
    setBusyId(cat.id);
    setStatus(null);
    try {
      await api.renameCategory(token, cat.id, name);
      await reload();
      setStatus("success");
    } catch {
      setStatus("rejected");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(cat: TemplateCategory) {
    if ((cat._count?.templates ?? 0) > 0) return;
    setBusyId(cat.id);
    setStatus(null);
    try {
      await api.deleteCategory(token, cat.id);
      await reload();
      setStatus("deleted");
    } catch {
      setStatus("rejected");
    } finally {
      setBusyId(null);
    }
  }

  async function createNew() {
    const name = newName.trim();
    if (!name) return;
    setBusyId("new");
    setStatus(null);
    try {
      await api.createCategory(token, name);
      setNewName("");
      await reload();
      setStatus("success");
    } catch {
      setStatus("rejected");
    } finally {
      setBusyId(null);
    }
  }

  const statusLabel =
    status === "success"
      ? "Success"
      : status === "deleted"
        ? "Deleted"
        : status === "rejected"
          ? "Rejected"
          : null;

  return (
    <section
      className={`category-manage form-stack ${onClose ? "is-modal" : "panel"}`}
    >
      <header className="category-manage-header">
        <div>
          {onClose ? null : <p className="eyebrow">Organization</p>}
          <h2 id="category-manage-title">Categories</h2>
          <p className="lede muted small">
            Assign any category to a card. Edit a name to save a rename. Delete
            only works when no cards use the category.
          </p>
        </div>
        {onClose ? (
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        ) : null}
      </header>

      {status && statusLabel ? (
        <div
          className={`category-status is-${status === "rejected" ? "neutral" : "success"}`}
          role={status === "rejected" ? "alert" : "status"}
        >
          <span>{statusLabel}</span>
          <button
            type="button"
            className="category-status-dismiss"
            aria-label="Dismiss"
            onClick={() => setStatus(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="category-manage-create">
        <label className="category-manage-create-field">
          <span className="visually-hidden">New category name</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name…"
            maxLength={80}
            disabled={busyId === "new"}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createNew();
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={busyId === "new" || !newName.trim()}
          onClick={() => void createNew()}
        >
          {busyId === "new" ? "Adding…" : "Add"}
        </button>
      </div>

      <div className="category-manage-block">
        <h3 className="category-manage-sub">Yours</h3>
        {mine.length === 0 ? (
          <p className="muted small">You haven’t created any categories yet.</p>
        ) : (
          <ul className="category-manage-list">
            {mine.map((cat) => {
              const usedCount = cat._count?.templates ?? 0;
              const inUse = usedCount > 0;
              const dirty = (drafts[cat.id] ?? "").trim() !== cat.name;
              return (
                <li key={cat.id} className="category-manage-row">
                  <div className="category-manage-edit">
                    <input
                      value={drafts[cat.id] ?? cat.name}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [cat.id]: e.target.value,
                        }))
                      }
                      disabled={busyId === cat.id}
                      maxLength={80}
                      aria-label={`Rename ${cat.name}`}
                    />
                    {dirty ? (
                      <button
                        type="button"
                        className="ghost small"
                        disabled={busyId === cat.id || !drafts[cat.id]?.trim()}
                        onClick={() => void saveRename(cat)}
                      >
                        {busyId === cat.id ? "Saving…" : "Save"}
                      </button>
                    ) : null}
                  </div>
                  <span className="category-manage-count">
                    {usedCount} card{usedCount === 1 ? "" : "s"}
                  </span>
                  {inUse ? (
                    <span className="muted small category-manage-blocked">
                      Can’t delete - used by {usedCount} card
                      {usedCount === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="linkish danger-text"
                      disabled={busyId === cat.id}
                      onClick={() => void remove(cat)}
                    >
                      Delete
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="category-manage-block">
        <h3 className="category-manage-sub">From other designers</h3>
        {others.length === 0 ? (
          <p className="muted small">No other categories yet.</p>
        ) : (
          <ul className="category-manage-list is-readonly">
            {others.map((cat) => (
              <li key={cat.id} className="category-manage-row is-readonly">
                <span className="category-manage-name">{cat.name}</span>
                <span className="category-manage-count">
                  {cat._count?.templates ?? 0} card
                  {(cat._count?.templates ?? 0) === 1 ? "" : "s"}
                  {cat.createdBy?.displayName
                    ? ` · ${cat.createdBy.displayName}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
