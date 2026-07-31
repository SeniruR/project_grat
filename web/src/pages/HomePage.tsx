import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { roleLabel } from "../lib/roles";
import { Breadcrumbs } from "../components/Breadcrumbs";

/** App home — pick Emails or Gifts. */
export function HomePage() {
  const { user } = useAuth();

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home" }]} />
      <header className="page-header">
        <div>
          <p className="eyebrow">Welcome · {roleLabel(user?.role ?? "USER")}</p>
          <h1>{user?.displayName}</h1>
          <p className="lede">
            Choose a product area to get started.
          </p>
        </div>
      </header>

      <div className="catalog-grid">
        <Link to="/emails" className="catalog-tile catalog-tile--live">
          <span className="catalog-type">EMAILS</span>
          <h2>Emails</h2>
          <p>
            Gratitude cards and templates — browse, design, send, and track
            history.
          </p>
        </Link>

        <div className="catalog-tile catalog-tile--soon" title="Coming soon">
          <span className="catalog-type">GIFTS</span>
          <h2>Gifts</h2>
          <p>Physical gifts and recognition — coming soon.</p>
          <span className="soon-tag">Coming soon</span>
        </div>
      </div>
    </div>
  );
}
