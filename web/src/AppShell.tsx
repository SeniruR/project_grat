import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { COMPOSE_ENABLED } from "./features";
import { canManageDesigns, isAdmin, roleLabel } from "./lib/roles";

type EmailsLink = {
  to: string;
  label: string;
  match?: (pathname: string) => boolean;
};

export function AppShell() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [emailsOpen, setEmailsOpen] = useState(false);
  const emailsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEmailsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!emailsRef.current?.contains(e.target as Node)) {
        setEmailsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEmailsOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (loading) {
    return (
      <div className="boot">
        <p>Loading session…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const emailsLinks: EmailsLink[] = [
    {
      to: "/emails",
      label: "Overview",
      match: (p) => p === "/emails",
    },
    {
      to: "/marketplace",
      label: "Templates",
      match: (p) => p.startsWith("/marketplace"),
    },
  ];
  if (canManageDesigns(user)) {
    emailsLinks.push({
      to: "/cards",
      label: "My Designs",
      match: (p) =>
        p.startsWith("/cards") && !/\/cards\/[^/]+\/compose/.test(p),
    });
  }
  if (COMPOSE_ENABLED) {
    emailsLinks.push({
      to: "/sent",
      label: "Sent History",
      match: (p) => p.startsWith("/sent") || p.startsWith("/drafts"),
    });
  }
  if (isAdmin(user)) {
    emailsLinks.push({
      to: "/admin",
      label: "Admin Panel",
      match: (p) => p.startsWith("/admin"),
    });
  }

  const emailsActive =
    location.pathname === "/emails" ||
    emailsLinks.some((l) =>
      l.match ? l.match(location.pathname) : location.pathname.startsWith(l.to),
    ) ||
    /\/cards\/[^/]+\/compose/.test(location.pathname);

  return (
    <div className="app-shell">
      <nav className="topnav">
        <Link to="/" className="brand">
          Gratitude
        </Link>
        <div className="topnav-links">
          <div
            className={`nav-dropdown ${emailsOpen ? "is-open" : ""} ${emailsActive ? "is-active" : ""}`}
            ref={emailsRef}
          >
            <div className="nav-dropdown-pair">
              <Link
                to="/emails"
                className="nav-dropdown-home"
                onClick={() => setEmailsOpen(false)}
              >
                Emails
              </Link>
              <button
                type="button"
                className="nav-dropdown-trigger"
                aria-expanded={emailsOpen}
                aria-haspopup="menu"
                aria-label="Emails menu"
                onClick={() => setEmailsOpen((v) => !v)}
              >
                <span className="nav-dropdown-caret" aria-hidden>
                  ▾
                </span>
              </button>
            </div>
            {emailsOpen ? (
              <div className="nav-dropdown-menu" role="menu">
                {emailsLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    role="menuitem"
                    className={({ isActive }) =>
                      isActive ||
                      (link.match?.(location.pathname) ?? false)
                        ? "is-active"
                        : undefined
                    }
                    onClick={() => setEmailsOpen(false)}
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>

          <span
            className="nav-link-disabled"
            title="Gifts is coming soon"
            aria-disabled="true"
          >
            Gifts
            <em className="nav-soon">Soon</em>
          </span>
        </div>
        <div className="topnav-user">
          <span>
            {user.displayName}
            <em> · {roleLabel(user.role)}</em>
          </span>
          <button type="button" className="ghost" onClick={logout}>
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
