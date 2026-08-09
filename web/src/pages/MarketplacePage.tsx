import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type MarketplaceCard } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { Breadcrumbs, emailsCrumb } from "../components/Breadcrumbs";
import { resolveMediaUrl } from "../lib/mediaUrl";

function previewSrc(card: MarketplaceCard) {
  return resolveMediaUrl(card.versions[0]?.previewUrl);
}

export function MarketplacePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState<MarketplaceCard[]>([]);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload(
    search = q,
    fav = favoritesOnly,
    cat = categoryId,
  ) {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.marketplace(token, {
        q: search,
        favorites: fav,
        categoryId: cat,
      });
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

  async function toggleFavorite(card: MarketplaceCard) {
    if (!token) return;
    setBusyId(card.id);
    try {
      if (card.isFavorite) await api.removeFavorite(token, card.id);
      else await api.addFavorite(token, card.id);
      setCards((prev) =>
        prev.map((c) =>
          c.id === card.id ? { ...c, isFavorite: !c.isFavorite } : c,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Favorite update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          emailsCrumb,
          { label: "Browse cards" },
        ]}
      />
      <header className="page-header">
        <div>
          <p className="eyebrow">Cards</p>
          <h1>Browse cards</h1>
          <p className="lede">
            Pick a card to preview, save as a favorite, then personalize and
            send.
          </p>
        </div>
      </header>

      <div className="marketplace-toolbar" data-tour="marketplace-browse">
        {token ? (
          <div className="marketplace-category-filter">
            <CategoryCombobox
              token={token}
              value={categoryId}
              onChange={(id) => {
                setCategoryId(id);
                void reload(q, favoritesOnly, id);
              }}
              allowClear
              allowCreate={false}
              countMode="shared"
              label=""
              placeholder="Category…"
            />
          </div>
        ) : null}
        <label className="marketplace-search">
          <span className="visually-hidden">Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void reload(q, favoritesOnly, categoryId);
            }}
            placeholder="Search by name or designer…"
          />
        </label>
        <button
          type="button"
          onClick={() => void reload(q, favoritesOnly, categoryId)}
        >
          Search
        </button>
        <button
          type="button"
          className={`marketplace-fav-toggle ${favoritesOnly ? "is-on" : ""}`}
          aria-pressed={favoritesOnly}
          aria-label={favoritesOnly ? "Show all cards" : "Show favorites only"}
          title={favoritesOnly ? "Showing favorites" : "Favorites"}
          onClick={() => {
            const next = !favoritesOnly;
            setFavoritesOnly(next);
            void reload(q, next, categoryId);
          }}
        >
          <StarIcon filled={favoritesOnly} />
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading cards…</p> : null}

      {!loading && cards.length === 0 ? (
        <p className="muted">
          {favoritesOnly
            ? "No favorites yet - tap the star on a card."
            : categoryId
              ? "No published cards in this category."
              : "No shared cards yet. Set a card to Shared in My cards to list it here."}
        </p>
      ) : (
        <div className="marketplace-grid">
          {cards.map((card) => {
            const thumb = previewSrc(card);
            const favorited = Boolean(card.isFavorite);
            return (
              <article key={card.id} className="marketplace-card">
                <div className="marketplace-card-preview-wrap">
                  <button
                    type="button"
                    className="marketplace-card-preview"
                    onClick={() => navigate(`/marketplace/${card.id}`)}
                  >
                    {thumb ? (
                      <img src={thumb} alt="" />
                    ) : (
                      <span className="marketplace-card-fallback">
                        {card.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`marketplace-card-star ${favorited ? "is-on" : ""}`}
                    disabled={busyId === card.id}
                    onClick={() => void toggleFavorite(card)}
                    aria-pressed={favorited}
                    aria-label={
                      favorited ? "Remove from favorites" : "Add to favorites"
                    }
                    title={favorited ? "Favorited" : "Favorite"}
                  >
                    <StarIcon filled={favorited} />
                  </button>
                </div>
                <div className="marketplace-card-body">
                  <h2>{card.name}</h2>
                  <p className="marketplace-card-meta muted small">
                    {card.category?.name ?? "Uncategorized"}
                    {" · "}
                    by {card.owner.displayName}
                  </p>
                  <div className="marketplace-card-actions">
                    <Link to={`/marketplace/${card.id}`}>Preview</Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        d="M12 3.6 14.7 9l5.9.5-4.5 3.9 1.4 5.7L12 16.8 6.5 19.1l1.4-5.7L3.4 9.5 9.3 9 12 3.6Z"
      />
    </svg>
  );
}
