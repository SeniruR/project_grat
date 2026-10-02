import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { canManageDesigns, homePath, isAdmin, roleLabel } from "./lib/roles";
import { COMPOSE_ENABLED } from "./features";
import { TourProvider } from "./tour/TourContext";
import { ProductTour } from "./tour/ProductTour";
import { SiteFooter } from "./components/SiteFooter";
import { BrandLogo } from "./components/BrandLogo";

export function AppShell() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (loading) {
    return (
      <div className="boot">
        <div className="boot-mark" aria-hidden />
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const designer = canManageDesigns(user);
  const admin = isAdmin(user);

  return (
    <TourProvider>
      <div className="app-shell">
        <header className="topnav-wrap">
          <nav className="topnav">
            <Link to={homePath(user)} className="brand">
              <BrandLogo size={44} />
            </Link>

            <div className="topnav-user">
              {designer ? (
                <NavLink
                  to="/cards"
                  className={({ isActive }) =>
                    `topnav-link${isActive ? " is-active" : ""}`
                  }
                >
                  My designs
                </NavLink>
              ) : null}
              {admin ? (
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `topnav-link${isActive ? " is-active" : ""}`
                  }
                >
                  Admin
                </NavLink>
              ) : null}
              {COMPOSE_ENABLED ? (
                <NavLink
                  to="/sent"
                  className={({ isActive }) =>
                    `topnav-link topnav-link-icon${isActive ? " is-active" : ""}`
                  }
                  data-tour="nav-history"
                  title="History"
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
                      d="M13 3a9 9 0 1 0 8.2 12.4l-1.8-.7A7.2 7.2 0 1 1 13 4.8V8l5-4-5-4v3zm-.8 5.2v5.1l4.3 2.6.8-1.3-3.5-2.1V8.2z"
                    />
                  </svg>
                  History
                </NavLink>
              ) : null}
              <div
                className={`nav-dropdown nav-dropdown--account${menuOpen ? " is-open" : ""}`}
                ref={menuRef}
              >
                <button
                  type="button"
                  className="account-trigger"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <span className="topnav-avatar" aria-hidden>
                    {(user.displayName || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="topnav-user-meta">
                    <strong>{user.displayName}</strong>
                    <span>{roleLabel(user.role)}</span>
                  </span>
                  <span className="nav-dropdown-caret" aria-hidden>
                    ▾
                  </span>
                </button>
                {menuOpen ? (
                  <div className="nav-dropdown-menu" role="menu">
                    <div className="account-menu-head">
                      <strong>{user.displayName}</strong>
                      <span>{roleLabel(user.role)}</span>
                    </div>
                    {admin ? (
                      <NavLink
                        to="/admin"
                        role="menuitem"
                        className="account-menu-item"
                      >
                        Admin
                      </NavLink>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      className="account-menu-item"
                      onClick={logout}
                    >
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </nav>
        </header>

        <main>
          <Outlet />
        </main>
        <div id="app-page-decor" />
        <SiteFooter />
        <ProductTour />
      </div>
    </TourProvider>
  );
}
