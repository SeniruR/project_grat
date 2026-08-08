import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { api, type TemplateSummary } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { wrapWithHeaderFooter } from "../lib/emailHtml";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { CategoryManagePanel } from "../components/CategoryManagePanel";
import { Breadcrumbs, emailsCrumb } from "../components/Breadcrumbs";
import {
  resolveMediaUrl,
  rewriteMediaUrlsInHtml,
} from "../lib/mediaUrl";

type VisibilityFilter = "all" | "private" | "published";

export function CardsPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] =
    useState<VisibilityFilter>("all");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [manageCategories, setManageCategories] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TemplateSummary | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  async function reload() {
    if (!token) return;
    const res = await api.templates(token);
    setTemplates(res.templates);
  }

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .templates(token)
      .then((res) => setTemplates(res.templates))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      )
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (visibilityFilter === "private" && t.visibility !== "PRIVATE") {
        return false;
      }
      if (visibilityFilter === "published" && t.visibility !== "SHARED") {
        return false;
      }
      if (categoryId && t.category?.id !== categoryId) {
        return false;
      }
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.owner.displayName.toLowerCase().includes(q) ||
        (t.category?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [templates, query, visibilityFilter, categoryId]);

  async function confirmDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteTemplate(token, deleteTarget.id);
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          emailsCrumb,
          { label: "My cards" },
        ]}
      />
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Cards</p>
          <h1>My cards</h1>
          <p className="lede">
            Your cards only. Share a card so everyone can find it under Browse
            cards.
          </p>
        </div>
        <div className="header-actions">
          {token && user ? (
            <button
              type="button"
              className="ghost"
              onClick={() => setManageCategories(true)}
            >
              Categories
            </button>
          ) : null}
          <Link className="btn-link" to="/cards/new">
            New card
          </Link>
        </div>
      </header>

      <div className="studio-toolbar">
        {token ? (
          <div className="studio-category-filter">
            <CategoryCombobox
              token={token}
              value={categoryId}
              onChange={(id) => setCategoryId(id)}
              allowClear
              allowCreate={false}
              label=""
              placeholder="Category…"
            />
          </div>
        ) : null}
        <label className="studio-search">
          <span className="visually-hidden">Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search my cards…"
          />
        </label>
        <label className="studio-select">
          <span className="visually-hidden">Visibility</span>
          <select
            value={visibilityFilter}
            onChange={(e) =>
              setVisibilityFilter(e.target.value as VisibilityFilter)
            }
            aria-label="Filter by visibility"
          >
            <option value="all">All</option>
            <option value="private">Only me</option>
            <option value="published">Shared</option>
          </select>
        </label>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading cards…</p> : null}

      <section className="panel">
        <h2>My cards</h2>
        {!loading && filtered.length === 0 ? (
          <p className="muted">
            {templates.length === 0
              ? "No cards yet - create one."
              : "No cards match this search or filter."}
          </p>
        ) : (
          <div className="template-card-grid">
            {filtered.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                canDelete={t.owner.id === user?.id || user?.role === "ADMIN"}
                onOpen={() => navigate(`/cards/${t.id}`)}
                onDelete={() => setDeleteTarget(t)}
              />
            ))}
          </div>
        )}
      </section>

      {manageCategories && token && user
        ? createPortal(
            <div
              className="app-modal-backdrop"
              role="presentation"
              onClick={() => setManageCategories(false)}
            >
              <div
                className="app-modal category-manage-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="category-manage-title"
                onClick={(e) => e.stopPropagation()}
              >
                <CategoryManagePanel
                  token={token}
                  currentUserId={user.id}
                  onClose={() => setManageCategories(false)}
                />
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
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="del-tpl-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="del-tpl-title">Delete card?</h2>
                <p>
                  Delete <strong>{deleteTarget.name}</strong> permanently? Sent
                  history is kept; this cannot be undone.
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
                    className="danger"
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

function TemplateCard({
  template,
  canDelete,
  onOpen,
  onDelete,
}: {
  template: TemplateSummary;
  canDelete: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const latest = template.versions[0];
  const editedAt = latest?.createdAt ?? template.updatedAt;
  const previewHtml = useMemo(() => {
    const body = (latest?.compiledHtml ?? "").trim();
    if (!body) {
      return `<div style="padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#6b7280;text-align:center;">No preview yet</div>`;
    }
    return rewriteMediaUrlsInHtml(
      wrapWithHeaderFooter(
        body,
        template.headerHtml,
        template.footerHtml,
      ),
    );
  }, [latest?.compiledHtml, template.headerHtml, template.footerHtml]);

  const thumbSrc = resolveMediaUrl(latest?.previewUrl);
  const isPrivate = template.visibility === "PRIVATE";
  const totalUsers = template.usageTotalUsers ?? 0;
  const sinceEdit = template.usageSinceLastEdit ?? 0;

  return (
    <article className="template-card">
      <button
        type="button"
        className="template-card-hit"
        onClick={onOpen}
        aria-label={`Open ${template.name}`}
      >
        <div className="template-card-preview" aria-hidden>
          {thumbSrc ? (
            <img className="template-card-png" src={thumbSrc} alt="" />
          ) : (
            <iframe
              title=""
              className="template-card-frame"
              sandbox=""
              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{margin:0;background:#fff;}</style></head><body>${previewHtml}</body></html>`}
            />
          )}
        </div>
        <div className="template-card-body">
          <div className="template-card-title-row">
            <h3 className="template-card-name">{template.name}</h3>
            <span
              className={`visibility-pill ${isPrivate ? "is-private" : "is-shared"}`}
              title={
                isPrivate
                  ? "Only you can see this card"
                  : "Shared - listed under Browse cards"
              }
            >
              {isPrivate ? <LockIcon /> : <ShareIcon />}
              <span>{isPrivate ? "Only me" : "Shared"}</span>
            </span>
          </div>
          <p className="template-card-meta">
            {template.category?.name ?? "Uncategorized"}
            {" · "}
            v{latest?.version ?? 1}
          </p>
          <p className="template-card-usage">
            {totalUsers} user{totalUsers === 1 ? "" : "s"} total
            {" · "}
            {sinceEdit} since last edit
          </p>
          <p className="template-card-edited">
            Edited {formatEdited(editedAt)}
          </p>
        </div>
      </button>
      {canDelete ? (
        <div className="template-card-footer">
          <button
            type="button"
            className="linkish danger-text template-card-delete-link"
            title="Delete card"
            aria-label={`Delete ${template.name}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </article>
  );
}

function formatEdited(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M17 8h-1V6a4 4 0 1 0-8 0v2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Zm-7-2a2 2 0 1 1 4 0v2h-4V6Zm7 14H7V10h10v10Z"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 0 0 21 5a3 3 0 1 0-2.97 3c.16 0 .32-.02.47-.05l-7.07 4.13c.05.2.07.41.07.62s-.02.42-.07.62l7.05 4.12c.16-.04.33-.06.51-.06A3 3 0 1 0 18 16.08Z"
      />
    </svg>
  );
}
