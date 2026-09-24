import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Breadcrumbs, emailsCrumb, adminCrumb } from "../components/Breadcrumbs";
import { AdminSubNav } from "../components/AdminSubNav";
import { ToastBanner } from "../components/ToastBanner";
import { DEFAULT_NAME_HONORIFICS } from "../lib/mergeFields";

type HonorificRow = { value: string; label: string; withName: boolean };

export function AdminSettingsPage() {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<HonorificRow[]>(() =>
    DEFAULT_NAME_HONORIFICS.map((h) => ({
      value: h.value,
      label: h.label,
      withName: h.withName !== false,
    })),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undoRows, setUndoRows] = useState<HonorificRow[] | null>(null);
  const [newValue, setNewValue] = useState("");
  const [newWithName, setNewWithName] = useState(true);
  const dismissNotice = useCallback(() => {
    setNotice(null);
    setUndoRows(null);
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .adminNameHonorifics(token)
      .then((res) => {
        setRows(
          res.honorifics.length
            ? res.honorifics.map((h) => ({
                value: h.value,
                label: h.label,
                withName: h.withName !== false,
              }))
            : [...DEFAULT_NAME_HONORIFICS].map((h) => ({
                value: h.value,
                label: h.label,
                withName: h.withName !== false,
              })),
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

  function toSaved(list: HonorificRow[]) {
    return list
      .map((r) => ({
        value: r.value.trim(),
        label: r.label.trim() || r.value.trim(),
        withName: r.withName,
      }))
      .filter((r) => r.value);
  }

  async function persist(
    next: HonorificRow[],
    opts?: { notice?: string; undo?: HonorificRow[] | null },
  ) {
    if (!token) return false;
    const cleaned = toSaved(next);
    if (!cleaned.length) {
      setError("Keep at least one title.");
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      const { honorifics } = await api.adminUpdateNameHonorifics(
        token,
        cleaned,
      );
      setRows(
        honorifics.map((h) => ({
          value: h.value,
          label: h.label,
          withName: h.withName !== false,
        })),
      );
      if (opts && "undo" in opts) setUndoRows(opts.undo ?? null);
      else setUndoRows(null);
      setNotice(opts?.notice ?? null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save titles");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateRow(index: number, value: string) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, value, label: value } : row,
      ),
    );
  }

  function commitTitle(index: number, previous: string, raw: string) {
    const value = raw.trim();
    if (value === previous.trim()) return;
    if (!value) {
      updateRow(index, previous);
      setError("A title can’t be empty.");
      return;
    }
    if (
      rows.some(
        (r, i) =>
          i !== index && r.value.trim().toLowerCase() === value.toLowerCase(),
      )
    ) {
      updateRow(index, previous);
      setError(`“${value}” is already in the list.`);
      return;
    }
    const next = rows.map((row, i) =>
      i === index ? { ...row, value, label: value } : row,
    );
    void persist(next);
  }

  function setWithName(index: number, withName: boolean) {
    const next = rows.map((row, i) =>
      i === index ? { ...row, withName } : row,
    );
    void persist(next);
  }

  function removeRow(index: number) {
    const removed = rows[index];
    if (!removed) return;
    void persist(
      rows.filter((_, i) => i !== index),
      {
        notice: `Removed ${removed.value}.`,
        undo: rows.map((row) => ({ ...row })),
      },
    );
  }

  function moveRow(index: number, dir: -1 | 1) {
    const next = [...rows];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    const tmp = next[index];
    next[index] = next[j];
    next[j] = tmp;
    void persist(next);
  }

  async function addRow() {
    const value = newValue.trim();
    if (!value || saving) return;
    if (rows.some((r) => r.value.toLowerCase() === value.toLowerCase())) {
      setError(`“${value}” is already in the list.`);
      return;
    }
    setAdding(true);
    const previous = rows.map((row) => ({ ...row }));
    const ok = await persist(
      [...rows, { value, label: value, withName: newWithName }],
      {
        notice: `Added ${value}.`,
        undo: previous,
      },
    );
    setAdding(false);
    if (ok) {
      setNewValue("");
      setNewWithName(true);
    }
  }

  function resetDefaults() {
    void persist(
      DEFAULT_NAME_HONORIFICS.map((h) => ({
        value: h.value,
        label: h.label,
        withName: h.withName !== false,
      })),
      { notice: "Restored the built-in titles." },
    );
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          emailsCrumb,
          adminCrumb,
          { label: "Titles" },
        ]}
      />
      <AdminSubNav />
      <header className="page-header" data-tour="admin-settings">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Manage titles</h1>
          <p className="lede">
            Titles people can put on a name when they share, such as Mr., Mrs.,
            or Sir. A new title keeps the recipient’s name after it unless you
            turn that off.
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      <ToastBanner
        message={notice}
        onClose={dismissNotice}
        variant="info"
        durationMs={7000}
        actionLabel={undoRows ? "Undo" : undefined}
        onAction={
          undoRows
            ? () => {
                void persist(undoRows, { undo: null });
              }
            : undefined
        }
      />

      <section className="panel admin-titles-panel">
        <h2 className="card-section-title">Add a title</h2>
        <div className="admin-title-add">
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            disabled={saving}
            maxLength={40}
            placeholder="e.g. Prof."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addRow();
              }
            }}
            aria-label="New title"
          />
          <label className="admin-title-add-name">
            <input
              type="checkbox"
              checked={newWithName}
              disabled={saving}
              onChange={(e) => setNewWithName(e.target.checked)}
            />
            Name after title
          </label>
          <button
            type="button"
            disabled={saving || !newValue.trim()}
            onClick={() => void addRow()}
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
      </section>

      <section className="panel admin-titles-panel">
        <h2 className="card-section-title">Titles</h2>
        <p className="muted small">
          Checked keeps the name, as in Mr. Jane. Unchecked uses the title
          alone, as in Dear Sir,. The order here is the order on Share.
        </p>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <table className="audit-table admin-title-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Name after title</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.value}-${index}`}>
                    <td>
                      <input
                        value={row.value}
                        onChange={(e) => updateRow(index, e.target.value)}
                        onFocus={(e) => {
                          e.currentTarget.dataset.previous = row.value;
                        }}
                        onBlur={(e) =>
                          commitTitle(
                            index,
                            e.currentTarget.dataset.previous ?? row.value,
                            e.currentTarget.value,
                          )
                        }
                        disabled={saving}
                        maxLength={40}
                        aria-label={`Title ${index + 1}`}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.withName}
                        disabled={saving}
                        aria-label={`Name after ${row.value || "title"}`}
                        onChange={(e) => setWithName(index, e.target.checked)}
                      />
                    </td>
                    <td className="admin-title-actions">
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
                        className="linkish danger-text"
                        disabled={saving || rows.length <= 1}
                        onClick={() => removeRow(index)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="surface-actions">
              <button
                type="button"
                className="linkish"
                disabled={saving}
                onClick={resetDefaults}
              >
                Restore built-in titles
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
