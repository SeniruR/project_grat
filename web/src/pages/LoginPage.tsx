import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { AppRole } from "../lib/roles";
import { setTourPending } from "../tour/storage";

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const [displayName, setDisplayName] = useState("Seniru");
  const [email, setEmail] = useState("seniru@slt.com.lk");
  const [role, setRole] = useState<AppRole>("USER");
  const [startTutorial, setStartTutorial] = useState(false);
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
      setTourPending(startTutorial);
      await login({
        email,
        displayName,
        role,
      });
    } catch (err) {
      setTourPending(false);
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-stage">
        <section className="login-hero" aria-label="Gratitude">
          <p className="login-kicker">Internal recognition</p>
          <h1 className="login-brand">Gratitude</h1>
          <p className="login-tagline">
            Send thank-you cards to colleagues across the organization.
          </p>
        </section>

        <section className="login-panel">
          <h2>Sign in</h2>
          <p className="lede">
            Use your work details. Pick a role to preview how each experience
            looks.
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
                User - browse and send
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="role"
                  checked={role === "DESIGNER"}
                  onChange={() => setRole("DESIGNER")}
                />
                Designer - create cards and send
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="role"
                  checked={role === "ADMIN"}
                  onChange={() => setRole("ADMIN")}
                />
                Admin - full access
              </label>
            </fieldset>
            <label className="check">
              <input
                type="checkbox"
                checked={startTutorial}
                onChange={(e) => setStartTutorial(e.target.checked)}
              />
              Start tutorial after sign in
            </label>
            <p className="muted small login-tour-hint">
              Covers the flow for the role you pick above (User, Designer, or
              Admin).
            </p>
            {error ? <p className="error">{error}</p> : null}
            <button type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mode-line">{modes}</p>
        </section>
      </div>
    </div>
  );
}
