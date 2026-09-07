import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { api, type TemplateSummary } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EmailCardThumb } from "../components/EmailCardThumb";
import { Breadcrumbs, emailsCrumb, myCardsCrumb } from "../components/Breadcrumbs";
import { refreshPreviewPngInPlace } from "../lib/importDesign";

type VisibilityFilter = "all" | "private" | "published";

export function CardsPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibilityFilter, setVisibilityFilter] =
    useState<VisibilityFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<TemplateSummary | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [refreshingPreviews, setRefreshingPreviews] = useState(false);
  const [previewProgress, setPreviewProgress] = useState<string | null>(null);

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
    return templates.filter((t) => {
      if (visibilityFilter === "private" && t.visibility !== "PRIVATE") {
        return false;
      }
      if (visibilityFilter === "published" && t.visibility !== "SHARED") {
        return false;
      }
      return true;
    });
  }, [templates, visibilityFilter]);

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

  async function refreshAllPreviews() {
    if (!token || refreshingPreviews || templates.length === 0) return;
    setRefreshingPreviews(true);
    setError(null);
    setPreviewProgress(null);
    let updated = 0;
    let skipped = 0;
    const failures: string[] = [];
    try {
      for (let i = 0; i < templates.length; i++) {
        const card = templates[i];
        setPreviewProgress(
          `Creating preview ${i + 1} of ${templates.length}…`,
        );
        try {
          const { template: full } = await api.template(token, card.id);
          const latest = full.versions[0];
          const html = latest?.compiledHtml ?? "";
          const { previewUrl } = await refreshPreviewPngInPlace(
            token,
            card.id,
            html,
            latest?.designJson ?? {},
          );
          updated += 1;
          setTemplates((prev) =>
            prev.map((t) => {
              if (t.id !== card.id) return t;
              const versions = t.versions[0]
                ? [
                    { ...t.versions[0], previewUrl },
                    ...t.versions.slice(1),
                  ]
                : t.versions;
              return { ...t, versions };
            }),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Preview failed";
          if (msg.includes("no email HTML")) skipped += 1;
          else failures.push(`${card.name}: ${msg}`);
        }
      }
      if (failures.length) {
        setError(
          `Updated ${updated} preview${updated === 1 ? "" : "s"}. ${failures.length} failed. ${failures.slice(0, 3).join(" ")}`,
        );
      } else {
        const skipNote =
          skipped > 0
            ? ` Skipped ${skipped} with no design HTML.`
            : "";
        setPreviewProgress(
          `Updated ${updated} preview${updated === 1 ? "" : "s"}.${skipNote}`,
        );
      }
    } finally {
      setRefreshingPreviews(false);
    }
  }

  return (
    <div className="page">
      <Breadcrumbs items={[emailsCrumb, myCardsCrumb]} />
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Cards</p>
          <h1>
            My <span className="title-accent">cards</span>
          </h1>
          <p className="lede">
            Arrange the cards everyone else will give. Share one so it appears
            when colleagues choose a card.
          </p>
        </div>
        <div className="header-actions">
          {token && templates.length > 0 ? (
            <button
              type="button"
              className="ghost"
              disabled={refreshingPreviews}
              title="Rebuild PNG thumbnails without changing Edited time"
              onClick={() => void refreshAllPreviews()}
            >
              {refreshingPreviews ? "Creating…" : "Create preview PNG"}
            </button>
          ) : null}
          <Link className="btn-link" to="/cards/new" data-tour="mycards-new">
            New card
          </Link>
        </div>
      </header>
      {previewProgress ? <p className="muted">{previewProgress}</p> : null}

      <div className="studio-toolbar">
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

      <section className="panel" data-tour="mycards-list">
        <h2>My cards</h2>
        {!loading && filtered.length === 0 ? (
          <p className="muted">
            {templates.length === 0
              ? "No cards yet - create one for others to send."
              : "No cards match this filter."}
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
          <EmailCardThumb
            previewUrl={latest?.previewUrl}
            fallbackLabel={template.name}
          />
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
      <div className="card-accent-bar" aria-hidden>
        <span className="card-accent-bar-fill" />
      </div>
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
