import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type MarketplaceCard } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { CanvasPreview } from "../components/CanvasPreview";
import { COMPOSE_ENABLED } from "../features";
import { Breadcrumbs, emailsCrumb } from "../components/Breadcrumbs";
import {
  resolveMediaUrl,
  rewriteMediaUrlsInHtml,
} from "../lib/mediaUrl";

export function MarketplaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [card, setCard] = useState<MarketplaceCard | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function toggleFavorite() {
    if (!token || !card) return;
    setBusy(true);
    setError(null);
    try {
      if (card.isFavorite) await api.removeFavorite(token, card.id);
      else await api.addFavorite(token, card.id);
      setCard({ ...card, isFavorite: !card.isFavorite });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Favorite update failed");
    } finally {
      setBusy(false);
    }
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
          { label: "Home", to: "/" },
          emailsCrumb,
          { label: "Browse cards", to: "/marketplace" },
          { label: card.name },
        ]}
      />
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Browse cards</p>
          <h1>{card.name}</h1>
          <p className="lede">
            {card.category?.name ?? "Uncategorized"}
            {" · "}
            by {card.owner.displayName}
          </p>
        </div>
        <div className="header-actions" data-tour="send-card">
          <button
            type="button"
            className={`marketplace-fav-toggle ${card.isFavorite ? "is-on" : ""}`}
            disabled={busy}
            onClick={() => void toggleFavorite()}
            aria-pressed={Boolean(card.isFavorite)}
            aria-label={card.isFavorite ? "Remove from favorites" : "Add to favorites"}
            title={card.isFavorite ? "Favorited" : "Favorite"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path
                fill={card.isFavorite ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
                d="M12 3.6 14.7 9l5.9.5-4.5 3.9 1.4 5.7L12 16.8 6.5 19.1l1.4-5.7L3.4 9.5 9.3 9 12 3.6Z"
              />
            </svg>
          </button>
          {COMPOSE_ENABLED ? (
            <button
              type="button"
              onClick={() => navigate(`/cards/${card.id}/compose`)}
            >
              Send this card
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
