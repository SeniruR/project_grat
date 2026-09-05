import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type MarketplaceCard } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EmailCardThumb } from "../components/EmailCardThumb";
import { canManageDesigns } from "../lib/roles";
import { COMPOSE_ENABLED } from "../features";

export function MarketplacePage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const skipPreview = !canManageDesigns(user) && COMPOSE_ENABLED;
  const [cards, setCards] = useState<MarketplaceCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.marketplace(token);
      setCards(res.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cards");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function openCard(card: MarketplaceCard) {
    if (skipPreview) {
      navigate(`/cards/${card.id}/compose`);
      return;
    }
    navigate(`/marketplace/${card.id}`);
  }

  const giveLabel = skipPreview ? "Give this" : "Look closer";

  return (
    <div className="page gift-page">
      <header className="gift-hero" data-tour="marketplace-browse">
        <div className="gift-hero-cover">
          <img
            className="gift-hero-cover-img"
            src="/marketplace-hero-cover.png"
            alt="A single flower, mug, and envelope on a quiet desk"
          />
          <div className="gift-hero-cover-copy">
            <p className="gift-kicker">It lands like a note on their desk</p>
            <h1>Someone made your day. Send it back.</h1>
            <p className="lede">
              Choose a card the way you would a bouquet — the one that says
              what you mean. It arrives as email; it still feels handwritten.
            </p>
          </div>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Finding cards…</p> : null}

      {!loading && cards.length === 0 ? (
        <p className="muted">
          No cards to give yet. When a design is shared, it will appear here.
        </p>
      ) : null}

      {!loading && cards.length > 0 ? (
        <div className="gift-shelf">
          {cards.map((card) => {
            const latest = card.versions[0];
            return (
              <article key={card.id} className="marketplace-card gift-shelf-card">
                <div className="marketplace-card-preview-wrap">
                  <button
                    type="button"
                    className="marketplace-card-preview"
                    onClick={() => openCard(card)}
                  >
                    <EmailCardThumb
                      previewUrl={latest?.previewUrl}
                      fallbackLabel={card.name}
                    />
                    <span className="gift-give-overlay">{giveLabel}</span>
                  </button>
                </div>
                <div className="marketplace-card-body">
                  <h2>{card.name}</h2>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
