import { useEffect, useMemo, useRef, useState } from "react";
import { api, type TemplateCategory } from "../api/client";

type Props = {
  token: string;
  value: string | null;
  onChange: (categoryId: string | null, category?: TemplateCategory | null) => void;
  disabled?: boolean;
  /** Allow clearing selection */
  allowClear?: boolean;
  /** Allow creating a new category from typed text */
  allowCreate?: boolean;
  placeholder?: string;
  label?: string;
};

/**
 * Searchable category dropdown. Designers see all org categories;
 * can create a new one from the typed query when allowCreate is on.
 */
export function CategoryCombobox({
  token,
  value,
  onChange,
  disabled,
  allowClear = true,
  allowCreate = true,
  placeholder = "Search or add a category…",
  label = "Category",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [selected, setSelected] = useState<TemplateCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .categories(token)
      .then((res) => {
        if (!cancelled) setCategories(res.categories);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    const hit = categories.find((c) => c.id === value);
    if (hit) setSelected(hit);
  }, [value, categories]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return categories.find((c) => c.name.toLowerCase() === q) ?? null;
  }, [categories, query]);

  async function createFromQuery() {
    const name = query.trim();
    if (!name || !allowCreate) return;
    setBusy(true);
    setError(null);
    try {
      const { category } = await api.createCategory(token, name);
      setCategories((prev) => {
        if (prev.some((c) => c.id === category.id)) return prev;
        return [...prev, category].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
      });
      setSelected(category);
      setQuery("");
      onChange(category.id, category);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create category");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="category-combo" ref={rootRef}>
      {label ? (
        <span className="category-combo-label">{label}</span>
      ) : null}
      <div className={`category-combo-control ${open ? "is-open" : ""}`}>
        <input
          type="text"
          disabled={disabled || busy}
          value={open ? query : selected?.name ?? ""}
          placeholder={selected ? selected.name : placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") {
              e.preventDefault();
              if (filtered[0]) {
                setSelected(filtered[0]);
                onChange(filtered[0].id, filtered[0]);
                setQuery("");
                setOpen(false);
              } else if (allowCreate && query.trim() && !exactMatch) {
                void createFromQuery();
              }
            }
          }}
          autoComplete="off"
        />
        {allowClear && selected && !disabled ? (
          <button
            type="button"
            className="linkish category-combo-clear"
            onClick={() => {
              setSelected(null);
              setQuery("");
              onChange(null, null);
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {open ? (
        <ul className="category-combo-menu" role="listbox">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === value ? "is-active" : ""}
                onClick={() => {
                  setSelected(c);
                  onChange(c.id, c);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <strong>{c.name}</strong>
                {typeof c._count?.templates === "number" ? (
                  <span className="muted small">
                    {c._count.templates} template
                    {c._count.templates === 1 ? "" : "s"}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {allowCreate && query.trim() && !exactMatch ? (
            <li>
              <button
                type="button"
                className="category-combo-create"
                disabled={busy}
                onClick={() => void createFromQuery()}
              >
                Create “{query.trim()}”
              </button>
            </li>
          ) : null}
          {filtered.length === 0 && !(allowCreate && query.trim()) ? (
            <li className="category-combo-empty muted small">No categories</li>
          ) : null}
        </ul>
      ) : null}
      {error ? <p className="error small">{error}</p> : null}
    </div>
  );
}
