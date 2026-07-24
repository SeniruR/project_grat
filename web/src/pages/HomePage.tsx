import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

type CatalogItem = {
  type: string;
  title: string;
  description: string;
  available: boolean;
};

export function HomePage() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .catalog(token)
      .then((res) => setItems(res.items))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load catalog"),
      );
  }, [token]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Welcome</p>
          <h1>{user?.displayName}</h1>
          <p className="lede">Choose what you want to send.</p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <div className="catalog-grid">
        {items.map((item) =>
          item.available ? (
            <Link
              key={item.type}
              to="/cards"
              className="catalog-tile catalog-tile--live"
            >
              <span className="catalog-type">{item.type}</span>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </Link>
          ) : (
            <div
              key={item.type}
              className="catalog-tile catalog-tile--soon"
              title={item.description}
            >
              <span className="catalog-type">{item.type}</span>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <span className="soon-tag">Coming later</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
