import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { canManageDesigns, isAdmin } from "../lib/roles";
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
        items={[{ label: "Cards" }]}
      />
      <header className="page-header page-header-hero">
        <div>
          <h1>
            Cards
          </h1>
          <p className="lede">
            Design the cards. Help people send them.
          </p>
        </div>
      </header>

      <div className="action-grid">
        <Link to="/marketplace" className="action-tile" data-tour="hub-browse">
          <div className="path-tile-copy">
            <span className="path-tile-label">Give</span>
            <h2>Choose a card</h2>
            <p>The ones ready to send — pick one and give it.</p>
          </div>
          <span className="action-tile-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5-5-5Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14Z"
              />
            </svg>
          </span>
        </Link>

        {canManageDesigns(user) ? (
          <Link to="/cards" className="action-tile" data-tour="hub-mycards">
            <div className="path-tile-copy">
              <span className="path-tile-label">Arrange</span>
              <h2>My cards</h2>
              <p>Create the cards everyone else will give.</p>
            </div>
            <span className="action-tile-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M3 17.3V21h3.8l11-11.1-3.8-3.8L3 17.3ZM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8 1.7-1.9Z"
                />
              </svg>
            </span>
          </Link>
        ) : null}

        {isAdmin(user) ? (
          <Link to="/admin" className="action-tile" data-tour="hub-admin">
            <div className="path-tile-copy">
              <span className="path-tile-label">Admin</span>
              <h2>Admin</h2>
              <p>People, roles, and activity.</p>
            </div>
            <span className="action-tile-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M19.1 12.7a7.5 7.5 0 0 0 .1-.7 7.5 7.5 0 0 0-.1-.7l2.1-1.6-2-3.4-2.5 1a7.2 7.2 0 0 0-1.2-.7L15 3h-4l-.4 2.6a7.2 7.2 0 0 0-1.2.7l-2.5-1-2 3.4 2.1 1.6a7.5 7.5 0 0 0-.1.7 7.5 7.5 0 0 0 .1.7L3.8 14.3l2 3.4 2.5-1a7.2 7.2 0 0 0 1.2.7L11 21h4l.4-2.6a7.2 7.2 0 0 0 1.2-.7l2.5 1 2-3.4-2-1.6ZM13 15.5A3.5 3.5 0 1 1 16.5 12 3.5 3.5 0 0 1 13 15.5Z"
                />
              </svg>
            </span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
