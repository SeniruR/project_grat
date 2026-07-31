import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, assetUrl, type MarketplaceCard } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { Breadcrumbs, emailsCrumb } from "../components/Breadcrumbs";

function previewSrc(card: MarketplaceCard) {
  const url = card.versions[0]?.previewUrl?.trim();
  if (!url) return null;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  if (url.startsWith("/uploads/")) {
    return `${import.meta.env.VITE_API_URL ?? "http://localhost:3001"}${url}`;
  }
  return assetUrl(url.replace(/^\/+/, ""));
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
      setError(err instanceof Error ? err.message : "Failed to load marketplace");
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
          { label: "Templates" },
        ]}
      />
      <header className="page-header">
        <div>
          <p className="eyebrow">Emails</p>
          <h1>Templates</h1>
          <p className="lede">
            Browse published templates, preview them, favorite for later, then
            personalize and send.
          </p>
        </div>
      </header>

      <div className="marketplace-toolbar">
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
              label=""
              placeholder="Category…"
            />
          </div>
        ) : null}
        <button
          type="button"
          className={`marketplace-fav-toggle ${favoritesOnly ? "is-on" : ""}`}
          aria-pressed={favoritesOnly}
          onClick={() => {
            const next = !favoritesOnly;
            setFavoritesOnly(next);
            void reload(q, next, categoryId);
          }}
        >
          <StarIcon filled={favoritesOnly} />
          <span>Favorites</span>
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading marketplace…</p> : null}

      {!loading && cards.length === 0 ? (
        <p className="muted">
          {favoritesOnly
            ? "No favorites yet — tap the star on a card."
            : categoryId
              ? "No published cards in this category."
              : "No published cards yet. Set a template’s visibility to Published in Design studio to list it here."}
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
