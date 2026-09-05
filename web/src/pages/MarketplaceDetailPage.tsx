import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api, type MarketplaceCard } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { COMPOSE_ENABLED } from "../features";
import { Breadcrumbs, emailsCrumb } from "../components/Breadcrumbs";

export function MarketplaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [card, setCard] = useState<MarketplaceCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (COMPOSE_ENABLED || !token || !id) return;
    api
      .marketplaceCard(token, id)
      .then((res) => {
        setCard(res.template);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load card"),
      );
  }, [token, id]);

  if (id && COMPOSE_ENABLED) {
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
        <p className="muted">Loading…</p>
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
          <span className="muted small">Sending is not available yet</span>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
