import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { canManageDesigns, isAdmin, roleLabel } from "../lib/roles";
import { COMPOSE_ENABLED } from "../features";
import { Breadcrumbs } from "../components/Breadcrumbs";

/** Cards hub - tools filtered by role. */
export function EmailsHomePage() {
  const { user } = useAuth();

  return (
    <div className="page">
      <Breadcrumbs
        items={[{ label: "Home", to: "/" }, { label: "Cards" }]}
      />
      <header className="page-header page-header-hero">
        <div>
          <p className="eyebrow">{roleLabel(user?.role ?? "USER")}</p>
          <h1>Cards</h1>
          <p className="lede">
            Tools for your role - browse, create, send, or administer cards.
          </p>
        </div>
      </header>

      <div className="action-grid">
        <Link to="/marketplace" className="action-tile">
          <span className="action-tile-icon" aria-hidden>
            ⌕
          </span>
          <h2>Browse cards</h2>
          <p>Find shared cards and send to colleagues.</p>
        </Link>

        {canManageDesigns(user) ? (
          <Link to="/cards" className="action-tile">
            <span className="action-tile-icon" aria-hidden>
              ✎
            </span>
            <h2>My cards</h2>
            <p>Create and share cards for others to send.</p>
          </Link>
        ) : null}

        {COMPOSE_ENABLED ? (
          <Link to="/sent" className="action-tile">
            <span className="action-tile-icon" aria-hidden>
              ↗
            </span>
            <h2>Sent</h2>
            <p>Review what you have already sent.</p>
          </Link>
        ) : null}

        {isAdmin(user) ? (
          <Link to="/admin" className="action-tile">
            <span className="action-tile-icon" aria-hidden>
              ⚙
            </span>
            <h2>Admin</h2>
            <p>People, roles, and activity.</p>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
