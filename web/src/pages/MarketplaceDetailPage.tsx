import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, type MarketplaceCard } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { CanvasPreview } from "../components/CanvasPreview";
import { COMPOSE_ENABLED } from "../features";
import { Breadcrumbs, emailsCrumb } from "../components/Breadcrumbs";
import {
  resolveMediaUrl,
  rewriteMediaUrlsInHtml,
} from "../lib/mediaUrl";
import { canManageDesigns } from "../lib/roles";

export function MarketplaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [card, setCard] = useState<MarketplaceCard | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    api
      .marketplaceCard(token, id)
      .then((res) => {
        setCard(res.template);
        setPreviewHtml(
          res.previewHtml ? rewriteMediaUrlsInHtml(res.previewHtml) : null,
        );
        setPreviewUrl(resolveMediaUrl(res.previewUrl));
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load card"),
      );
  }, [token, id]);

  const width = useMemo(() => {
    const w = card?.versions[0]?.designJson?.width;
    return typeof w === "number" && w >= 200 ? w : 600;
  }, [card]);

  const height = useMemo(() => {
    const h = card?.versions[0]?.designJson?.height;
    return typeof h === "number" && h >= 200 ? h : 800;
  }, [card]);

  if (id && !canManageDesigns(user) && COMPOSE_ENABLED) {
    return <Navigate to={`/cards/${id}/compose`} replace />;
  }

  if (error && !card) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link to="/marketplace">Back to Browse cards</Link>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="page">
        <p className="muted">Loading preview…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          emailsCrumb,
          { label: "Choose a card", to: "/marketplace" },
          { label: card.name },
        ]}
      />
      <header className="page-header page-header-row">
        <div>
          <h1>{card.name}</h1>
          <p className="lede">A card ready to give.</p>
        </div>
        <div className="header-actions" data-tour="send-card">
          {COMPOSE_ENABLED ? (
            <button
              type="button"
              onClick={() => navigate(`/cards/${card.id}/compose`)}
            >
              Give this
            </button>
          ) : (
            <span className="muted small">Sending is not available yet</span>
          )}
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {previewHtml ? (
        <CanvasPreview
          width={width}
          height={height}
          html={previewHtml}
          versionKey={card.versions[0]?.version}
          pasteMode="html"
          htmlOnly
        />
      ) : previewUrl ? (
        <CanvasPreview
          width={width}
          height={height}
          pngUrl={previewUrl}
          versionKey={card.versions[0]?.version}
          pasteMode="png"
        />
      ) : (
        <p className="muted">No preview available for this card yet.</p>
      )}
    </div>
  );
}
