import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { AppRole } from "../lib/roles";

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const [displayName, setDisplayName] = useState("Seniru");
  const [email, setEmail] = useState("seniru@slt.com.lk");
  const [role, setRole] = useState<AppRole>("ADMIN");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modes, setModes] = useState("…");

  useEffect(() => {
    api
      .getMode()
      .then((m) =>
        setModes(
          `auth=${m.authMode} · directory=${m.directoryMode} · mail=${m.mailMode}`,
        ),
      )
      .catch(() => setModes("API offline"));
  }, []);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({
        email,
        displayName,
        role,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-panel">
        <p className="eyebrow">Intranet</p>
        <h1>Gratitude</h1>
        <p className="lede">
          Dev sign-in stand-in for Azure AD. Pick a role to try Admin, Designer,
          or User experiences.
        </p>

        <form className="login-form" onSubmit={onSubmit}>
          <label>
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoComplete="name"
            />
          </label>
          <label>
            Work email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <fieldset className="choice-set">
            <legend>Role</legend>
            <label className="check">
              <input
                type="radio"
                name="role"
                checked={role === "USER"}
                onChange={() => setRole("USER")}
              />
              User — marketplace + send only
            </label>
            <label className="check">
              <input
                type="radio"
                name="role"
                checked={role === "DESIGNER"}
                onChange={() => setRole("DESIGNER")}
              />
              Designer — designs + send
            </label>
            <label className="check">
              <input
                type="radio"
                name="role"
                checked={role === "ADMIN"}
                onChange={() => setRole("ADMIN")}
              />
              Admin — everything + user management
            </label>
          </fieldset>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Enter intranet"}
          </button>
        </form>

        <p className="mode-line">{modes}</p>
      </div>
    </div>
  );
}
