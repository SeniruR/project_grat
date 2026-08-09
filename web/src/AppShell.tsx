import { Navigate, Outlet, Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { roleLabel } from "./lib/roles";
import { TourProvider } from "./tour/TourContext";
import { ProductTour } from "./tour/ProductTour";

function pathInCards(pathname: string) {
  return (
    pathname === "/emails" ||
    pathname.startsWith("/marketplace") ||
    pathname.startsWith("/cards") ||
    pathname.startsWith("/sent") ||
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

  const onCards = pathInCards(location.pathname);

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
              to="/emails"
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
