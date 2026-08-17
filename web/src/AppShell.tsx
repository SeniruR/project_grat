import { Navigate, Outlet, Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { canManageDesigns, roleLabel } from "./lib/roles";
import { COMPOSE_ENABLED } from "./features";
import { TourProvider } from "./tour/TourContext";
import { ProductTour } from "./tour/ProductTour";

function pathInCards(pathname: string, simpleUser: boolean) {
  if (simpleUser) {
    return (
      pathname === "/emails" ||
      pathname.startsWith("/marketplace") ||
      pathname.startsWith("/cards") ||
      pathname.startsWith("/drafts")
    );
  }
  return (
    pathname === "/emails" ||
    pathname.startsWith("/marketplace") ||
    pathname.startsWith("/cards") ||
    pathname.startsWith("/drafts") ||
    pathname.startsWith("/admin")
  );
}

export function AppShell() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="boot">
        <div className="boot-mark" aria-hidden />
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const simpleUser = !canManageDesigns(user);
  const onCards = pathInCards(location.pathname, simpleUser);
  const onSent = location.pathname.startsWith("/sent");
  const cardsTo = simpleUser ? "/marketplace" : "/emails";

  return (
    <TourProvider>
      <div className="app-shell">
        <nav className="topnav">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden />
            Gratitude
          </Link>

          <div className="topnav-links">
            <NavLink
              to={cardsTo}
              className={() => `topnav-link ${onCards ? "is-active" : ""}`}
            >
              Cards
            </NavLink>
            <span className="nav-link-disabled" title="Coming soon">
              Gifts
              <em className="nav-soon">Soon</em>
            </span>
          </div>

          <div className="topnav-user">
            {COMPOSE_ENABLED ? (
              <NavLink
                to="/sent"
                className={() =>
                  `topnav-link topnav-link-icon ${onSent ? "is-active" : ""}`
                }
              >
                <svg
                  className="topnav-sent-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    fill="currentColor"
                    d="M3.4 20.6 22 12 3.4 3.4l.1 6.7L16 12 3.5 13.9z"
                  />
                </svg>
                Sent
              </NavLink>
            ) : null}
            <div className="topnav-avatar" aria-hidden>
              {(user.displayName || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="topnav-user-meta">
              <strong>{user.displayName}</strong>
              <span>{roleLabel(user.role)}</span>
            </div>
            <button
              type="button"
              className="ghost topnav-signout"
              onClick={logout}
            >
              Sign out
            </button>
          </div>
        </nav>
        <main>
          <Outlet />
        </main>
        <ProductTour />
      </div>
    </TourProvider>
  );
}
