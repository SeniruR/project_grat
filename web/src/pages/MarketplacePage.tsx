import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type MarketplaceCard } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EmailCardThumb } from "../components/EmailCardThumb";
import { COMPOSE_ENABLED } from "../features";
import { GiftVineDecor } from "../components/GiftVineDecor";
import { HeroLoopVideo } from "../components/HeroLoopVideo";
import { BrandLogo } from "../components/BrandLogo";

export function MarketplacePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const skipPreview = COMPOSE_ENABLED;
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
      <GiftVineDecor />
      <header className="gift-hero" data-tour="marketplace-browse">
        <div className="gift-hero-cover">
          <div className="gift-hero-copy-panel">
            <h1>
              <BrandLogo size={42} />
            </h1>
            <p className="lede">Thank a colleague.</p>
          </div>
          <div className="gift-hero-media" aria-hidden>
            <HeroLoopVideo
              className="gift-hero-evening-media"
              src="/meadow-hero-whatsapp.mp4"
              poster="/marketplace-hero-illustration.png"
            />
            <img
              className="gift-hero-cover-img gift-hero-cover-img--morning"
              src="/marketplace-hero-morning.png"
              alt=""
              decoding="async"
            />
            <img
              className="gift-hero-cover-img gift-hero-cover-img--still"
              src="/marketplace-hero-still.png"
              alt=""
              decoding="async"
            />
          </div>
        </div>
      </header>

      <div className="gift-page-content">
        <section className="gift-pick" aria-labelledby="gift-pick-title">
          <h2 id="gift-pick-title" className="gift-pick-title">
            Choose a card
          </h2>
        </section>

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
    </div>
  );
}
