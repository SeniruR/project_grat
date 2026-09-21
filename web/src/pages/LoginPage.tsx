import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { homePath, type AppRole } from "../lib/roles";
import { setTourPending } from "../tour/storage";

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const [displayName, setDisplayName] = useState("Admin");
  const [email, setEmail] = useState("admin@example.com");
  const [role, setRole] = useState<AppRole>("USER");
  const [startTutorial, setStartTutorial] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modes, setModes] = useState<string | null>(null);

  useEffect(() => {
    if (!showDemo) return;
    api
      .getMode()
      .then((m) =>
        setModes(
          `auth=${m.authMode} · directory=${m.directoryMode} · mail=${m.mailMode}`,
        ),
      )
      .catch(() => setModes("API offline"));
  }, [showDemo]);

  if (!loading && user) {
    return <Navigate to={homePath(user)} replace />;
  }

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
      <img
        className="login-bg"
        src="/login-meadow-bg.png"
        alt=""
        aria-hidden
      />
      <div className="login-stage">
        <div className="login-stage-body">
          <section className="login-hero" aria-label="Gratitude Bloom">
            <div className="login-hero-copy">
              <img
                className="login-mark"
                src="/slt-logo.png"
                alt="SLT Mobitel"
              />
              <h1 className="login-brand">
                Gratitude
                <span>Bloom</span>
              </h1>
              <p className="login-tagline">
                Strong connection with appreciation
              </p>
            </div>
          </section>

          <section className="login-panel">
            <h2>Sign in</h2>
            <p className="lede">
              Enter your name and work email to continue.
            </p>

            <form className="login-form" onSubmit={onSubmit}>
              <label>
                Your name
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
              {showDemo ? (
                <>
                  <fieldset className="choice-set">
                    <legend>Try as</legend>
                    <label className="check">
                      <input
                        type="radio"
                        name="role"
                        checked={role === "USER"}
                        onChange={() => setRole("USER")}
                      />
                      Someone sending a card
                    </label>
                    <label className="check">
                      <input
                        type="radio"
                        name="role"
                        checked={role === "DESIGNER"}
                        onChange={() => setRole("DESIGNER")}
                      />
                      Someone who designs cards
                    </label>
                    <label className="check">
                      <input
                        type="radio"
                        name="role"
                        checked={role === "ADMIN"}
                        onChange={() => setRole("ADMIN")}
                      />
                      Someone who looks after the system
                    </label>
                  </fieldset>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={startTutorial}
                      onChange={(e) => setStartTutorial(e.target.checked)}
                    />
                    Show me around after I sign in
                  </label>
                </>
              ) : null}
              {error ? <p className="error">{error}</p> : null}
              <button
                type="submit"
                className="login-continue"
                disabled={submitting}
              >
                {submitting ? "Signing in…" : "Continue"}
              </button>
            </form>

            <button
              type="button"
              className="login-demo-swap"
              onClick={() => setShowDemo((open) => !open)}
            >
              {showDemo
                ? "Hide demonstration options"
                : "Demonstration options"}
            </button>
            {showDemo && modes ? <p className="mode-line">{modes}</p> : null}
          </section>
        </div>
        <p className="login-credit">
          Customer Experience Division – Customer Service Week 2026
        </p>
      </div>
    </div>
  );
}
