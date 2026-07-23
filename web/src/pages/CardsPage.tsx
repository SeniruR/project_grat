import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type TemplateSummary } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { wrapWithHeaderFooter } from "../designer/compile";

export function CardsPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  const mine = templates.filter((t) => t.owner.id === user?.id);
  const shared = templates.filter(
    (t) => t.owner.id !== user?.id && t.visibility === "SHARED",
  );

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
      <p className="back">
        <Link to="/">← Catalog</Link>
      </p>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Cards</p>
          <h1>Gratitude templates</h1>
          <p className="lede">
            Create private or shared templates. Click a card to open it.
          </p>
        </div>
        <Link className="btn-link" to="/cards/new">
          New template
        </Link>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading templates…</p> : null}

      <TemplateGroup
        title="My templates"
        items={mine}
        empty="No templates yet — create one."
        canDelete
        currentUserId={user?.id}
        isAdmin={user?.role === "ADMIN"}
        onOpen={(id) => navigate(`/cards/${id}`)}
        onDelete={(t) => setDeleteTarget(t)}
      />
      <TemplateGroup
        title="Shared with org"
        items={shared}
        empty="No shared templates from others yet."
        canDelete
        currentUserId={user?.id}
        isAdmin={user?.role === "ADMIN"}
        onOpen={(id) => navigate(`/cards/${id}`)}
        onDelete={(t) => setDeleteTarget(t)}
      />

      {deleteTarget ? (
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
            <h2 id="del-tpl-title">Delete template?</h2>
            <p>
              Delete <strong>{deleteTarget.name}</strong> permanently? This
              cannot be undone.
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
        </div>
      ) : null}
    </div>
  );
}

function TemplateGroup({
  title,
  items,
  empty,
  canDelete,
  currentUserId,
  isAdmin,
  onOpen,
  onDelete,
}: {
  title: string;
  items: TemplateSummary[];
  empty: string;
  canDelete: boolean;
  currentUserId?: string;
  isAdmin?: boolean;
  onOpen: (id: string) => void;
  onDelete: (t: TemplateSummary) => void;
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="template-card-grid">
          {items.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              canDelete={
                canDelete &&
                (t.owner.id === currentUserId || Boolean(isAdmin))
              }
              onOpen={() => onOpen(t.id)}
              onDelete={() => onDelete(t)}
            />
          ))}
        </div>
      )}
    </section>
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
  const mode =
    typeof latest?.designJson?.mode === "string"
      ? latest.designJson.mode
      : "blank";
  const editedAt = latest?.createdAt ?? template.updatedAt;
  const previewHtml = useMemo(() => {
    const body = (latest?.compiledHtml ?? "").trim();
    if (!body) {
      return `<div style="padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#6b7280;text-align:center;">No preview yet</div>`;
    }
    return wrapWithHeaderFooter(
      body,
      template.headerHtml,
      template.footerHtml,
    );
  }, [latest?.compiledHtml, template.headerHtml, template.footerHtml]);

  const isPrivate = template.visibility === "PRIVATE";

  return (
    <article className="template-card">
      <button
        type="button"
        className="template-card-hit"
        onClick={onOpen}
        aria-label={`Open ${template.name}`}
      >
        <div className="template-card-preview" aria-hidden>
          <iframe
            title=""
            className="template-card-frame"
            sandbox=""
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{margin:0;background:#fff;}</style></head><body>${previewHtml}</body></html>`}
          />
        </div>
        <div className="template-card-body">
          <div className="template-card-title-row">
            <h3 className="template-card-name">{template.name}</h3>
            <span
              className={`visibility-pill ${isPrivate ? "is-private" : "is-shared"}`}
              title={isPrivate ? "Private" : "Shared with org"}
            >
              {isPrivate ? (
                <LockIcon />
              ) : (
                <ShareIcon />
              )}
              <span>{isPrivate ? "Private" : "Shared"}</span>
            </span>
          </div>
          <p className="template-card-meta">
            <span className={`status-dot ${template.status.toLowerCase()}`} />
            {template.status === "PUBLISHED" ? "Published" : "Draft"}
            {" · "}
            {mode === "designer"
              ? "Designer"
              : mode === "html_import"
                ? "HTML"
                : "Blank"}
            {" · "}
            v{latest?.version ?? 1}
          </p>
          <p className="template-card-edited">
            Edited {formatEdited(editedAt)}
            {template.owner.displayName
              ? ` · ${template.owner.displayName}`
              : ""}
          </p>
        </div>
      </button>
      {canDelete ? (
        <button
          type="button"
          className="template-card-delete"
          title="Delete template"
          aria-label={`Delete ${template.name}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </button>
      ) : null}
    </article>
  );
}

function formatEdited(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
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
