import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { canManageDesigns, isAdmin, roleLabel } from "../lib/roles";
import { Breadcrumbs } from "../components/Breadcrumbs";

/** Cards hub - tools filtered by role. */
export function EmailsHomePage() {
  const { user } = useAuth();

  if (!canManageDesigns(user)) {
    return <Navigate to="/marketplace" replace />;
  }

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
        <Link to="/marketplace" className="action-tile" data-tour="hub-browse">
          <span className="action-tile-icon" aria-hidden>
            ⌕
          </span>
          <h2>Browse cards</h2>
          <p>Find shared cards and send to colleagues.</p>
        </Link>

        {canManageDesigns(user) ? (
          <Link to="/cards" className="action-tile" data-tour="hub-mycards">
            <span className="action-tile-icon" aria-hidden>
              ✎
            </span>
            <h2>My cards</h2>
            <p>Create and share cards for others to send.</p>
          </Link>
        ) : null}

        {isAdmin(user) ? (
          <Link to="/admin" className="action-tile" data-tour="hub-admin">
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
