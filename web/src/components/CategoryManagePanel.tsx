import { useEffect, useState } from "react";
import { api, type TemplateCategory } from "../api/client";

type Props = {
  token: string;
  currentUserId: string;
};

/**
 * Manage categories you created: rename or delete (delete only when unused).
 * Other designers’ categories are listed read-only.
 */
export function CategoryManagePanel({ token, currentUserId }: Props) {
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load categories"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const mine = categories.filter((c) => c.createdBy?.id === currentUserId);
  const others = categories.filter((c) => c.createdBy?.id !== currentUserId);

  async function saveRename(cat: TemplateCategory) {
    const name = (drafts[cat.id] ?? "").trim();
    if (!name || name === cat.name) return;
    setBusyId(cat.id);
    setError(null);
    setNotice(null);
    try {
      await api.renameCategory(token, cat.id, name);
      await reload();
      setNotice(`Renamed to “${name}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(cat: TemplateCategory) {
    if ((cat._count?.templates ?? 0) > 0) return;
    setBusyId(cat.id);
    setError(null);
    setNotice(null);
    try {
      await api.deleteCategory(token, cat.id);
      await reload();
      setNotice(`Deleted “${cat.name}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function createNew() {
    const name = newName.trim();
    if (!name) return;
    setBusyId("new");
    setError(null);
    setNotice(null);
    try {
      const { category, created } = await api.createCategory(token, name);
      setNewName("");
      await reload();
      setNotice(
        created
          ? `Created “${category.name}”.`
          : `“${category.name}” already existed.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel category-manage form-stack">
      <header className="category-manage-header">
        <div>
          <p className="eyebrow">Organization</p>
          <h2>Categories</h2>
          <p className="lede muted small">
            Everyone can assign any category. Only you can rename or delete ones
            you created (and only when no templates use them).
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

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
              const inUse = (cat._count?.templates ?? 0) > 0;
              const dirty = (drafts[cat.id] ?? "").trim() !== cat.name;
              return (
                <li key={cat.id} className="category-manage-row">
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
                  <span className="category-manage-count">
                    {cat._count?.templates ?? 0} template
                    {(cat._count?.templates ?? 0) === 1 ? "" : "s"}
                  </span>
                  <div className="category-manage-actions">
                    <button
                      type="button"
                      className="ghost small"
                      disabled={busyId === cat.id || !dirty}
                      onClick={() => void saveRename(cat)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="linkish danger-text"
                      disabled={busyId === cat.id || inUse}
                      title={
                        inUse
                          ? "Reassign or delete templates first"
                          : "Delete category"
                      }
                      onClick={() => void remove(cat)}
                    >
                      Delete
                    </button>
                  </div>
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
                  {cat._count?.templates ?? 0} template
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
