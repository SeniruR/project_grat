import { Navigate, Outlet, Link } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";

export function AppShell() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="boot">
        <p>Loading session…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <nav className="topnav">
        <Link to="/" className="brand">
          Gratitude
        </Link>
        <div className="topnav-links">
          <Link to="/cards">Cards</Link>
          {user.role === "ADMIN" ? <Link to="/admin">Admin</Link> : null}
        </div>
        <div className="topnav-user">
          <span>
            {user.displayName}
            <em>{user.role === "ADMIN" ? " · admin" : ""}</em>
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
