import { Navigate, Outlet, Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { COMPOSE_ENABLED } from "./features";
import { canManageDesigns, isAdmin, roleLabel } from "./lib/roles";

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

  const onMyCards =
    location.pathname.startsWith("/cards") &&
    !/\/cards\/[^/]+\/compose/.test(location.pathname);
  const onSent =
    location.pathname.startsWith("/sent") ||
    location.pathname.startsWith("/drafts");

  return (
    <div className="app-shell">
      <nav className="topnav">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden />
          Gratitude
        </Link>

        <div className="topnav-links">
          <NavLink
            to="/marketplace"
            className={({ isActive }) =>
              `topnav-link ${isActive ? "is-active" : ""}`
            }
          >
            Browse
          </NavLink>
          {canManageDesigns(user) ? (
            <NavLink
              to="/cards"
              className={() => `topnav-link ${onMyCards ? "is-active" : ""}`}
            >
              My cards
            </NavLink>
          ) : null}
          {COMPOSE_ENABLED ? (
            <NavLink
              to="/sent"
              className={() => `topnav-link ${onSent ? "is-active" : ""}`}
            >
              Sent
            </NavLink>
          ) : null}
          {isAdmin(user) ? (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `topnav-link ${isActive ? "is-active" : ""}`
              }
            >
              Admin
            </NavLink>
          ) : null}
          <span className="nav-link-disabled" title="Coming soon">
            Gifts
            <em className="nav-soon">Soon</em>
          </span>
        </div>

        <div className="topnav-user">
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
    </div>
  );
}
