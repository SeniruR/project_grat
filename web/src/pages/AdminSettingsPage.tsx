import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Breadcrumbs, emailsCrumb } from "../components/Breadcrumbs";
import { AdminSubNav } from "../components/AdminSubNav";
import { DEFAULT_NAME_HONORIFICS } from "../lib/mergeFields";

type HonorificRow = { value: string; label: string };

export function AdminSettingsPage() {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<HonorificRow[]>([...DEFAULT_NAME_HONORIFICS]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .adminNameHonorifics(token)
      .then((res) => {
        setRows(
          res.honorifics.length
            ? res.honorifics
            : [...DEFAULT_NAME_HONORIFICS],
        );
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Could not load prefixes",
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

  function updateRow(index: number, value: string) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { value, label: value } : row,
      ),
    );
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function moveRow(index: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index];
      next[index] = next[j];
      next[j] = tmp;
      return next;
    });
  }

  function addRow() {
    const value = newValue.trim();
    if (!value) return;
    if (rows.some((r) => r.value.toLowerCase() === value.toLowerCase())) {
      setError(`“${value}” is already in the list.`);
      return;
    }
    setError(null);
    setRows((prev) => [...prev, { value, label: value }]);
    setNewValue("");
  }

  async function save() {
    if (!token) return;
    const cleaned = rows
      .map((r) => ({
        value: r.value.trim(),
        label: r.label.trim() || r.value.trim(),
      }))
      .filter((r) => r.value);
    if (!cleaned.length) {
      setError("Add at least one prefix.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { honorifics } = await api.adminUpdateNameHonorifics(
        token,
        cleaned,
      );
      setRows(honorifics);
      setNotice("Saved name prefixes. Compose dropdowns will use this list.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    setRows([...DEFAULT_NAME_HONORIFICS]);
    setNotice(null);
    setError(null);
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          emailsCrumb,
          { label: "Admin Panel", to: "/admin" },
          { label: "Settings" },
        ]}
      />
      <AdminSubNav />
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Compose settings</h1>
          <p className="lede">
            Choose which name titles composers may add as optional recipient
            groups (Mr., Mrs., Sir, …). On Compose they start without prefixes
            and only add the ones they need.
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <section className="panel form-stack">
        <h2 className="card-section-title">Name prefixes</h2>
        <p className="muted small">
          Each prefix becomes a recipient group on Compose with its own search.
          Add several people under Mr., others under Mrs., and so on. Order here
          is the order of those groups.
        </p>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <ul className="admin-honorific-list">
              {rows.map((row, index) => (
                <li key={`${row.value}-${index}`}>
                  <input
                    value={row.value}
                    onChange={(e) => updateRow(index, e.target.value)}
                    disabled={saving}
                    maxLength={40}
                    aria-label={`Prefix ${index + 1}`}
                  />
                  <div className="admin-honorific-actions">
                    <button
                      type="button"
                      className="ghost"
                      disabled={saving || index === 0}
                      onClick={() => moveRow(index, -1)}
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={saving || index === rows.length - 1}
                      onClick={() => moveRow(index, 1)}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={saving || rows.length <= 1}
                      onClick={() => removeRow(index)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="admin-honorific-add">
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                disabled={saving}
                maxLength={40}
                placeholder="e.g. Prof."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRow();
                  }
                }}
                aria-label="New prefix"
              />
              <button
                type="button"
                className="ghost"
                disabled={saving || !newValue.trim()}
                onClick={addRow}
              >
                Add
              </button>
            </div>

            <div className="surface-actions">
              <button type="button" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save prefixes"}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={saving}
                onClick={resetDefaults}
              >
                Reset to defaults
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
