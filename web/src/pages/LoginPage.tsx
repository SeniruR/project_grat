import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { apiBaseUrl } from "../lib/mediaUrl";
import { homePath, type AppRole } from "../lib/roles";
import { SiteCredit } from "../components/SiteFooter";
import { setTourPending } from "../tour/storage";

export function LoginPage() {
  const { user, login, acceptToken, loading } = useAuth();
  const [employeeNumber, setEmployeeNumber] = useState("100001");
  const [email, setEmail] = useState("admin@example.com");
  const [role, setRole] = useState<AppRole>("USER");
  const [startTutorial, setStartTutorial] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modes, setModes] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<string | null>(null);
  const [azureReady, setAzureReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const azureToken = params.get("token");
    const azureError = params.get("azure_error");
    if (!azureToken && !azureError) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (azureError) {
      setError(azureError);
      return;
    }
    setSubmitting(true);
    acceptToken(azureToken!)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      })
      .finally(() => setSubmitting(false));
  }, [acceptToken]);

  useEffect(() => {
    api
      .getMode()
      .then((m) => {
        setAuthMode(m.authMode);
        setAzureReady(Boolean(m.azureReady));
        setModes(
          `auth=${m.authMode} · directory=${m.directoryMode} · mail=${m.mailMode}`,
        );
      })
      .catch(() => {
        setAuthMode("dev");
        setModes("API offline");
      });
  }, []);

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
        employeeNumber,
        role: showDemo ? role : "USER",
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
                Strong connections begins with appreciation
              </p>
            </div>
          </section>

          <section className="login-panel">
            <h2>Sign in</h2>
            {authMode === null ? (
              <p className="lede">Checking sign-in…</p>
            ) : authMode === "azure" ? (
              <>
                <p className="lede">
                  Use your work account. People search and sent cards use that
                  same mailbox.
                </p>
                {error ? <p className="error">{error}</p> : null}
                {azureReady ? (
                  <a
                    className="login-continue"
                    href={`${apiBaseUrl()}/auth/azure/start`}
                  >
                    {submitting ? "Signing in…" : "Sign in with work account"}
                  </a>
                ) : (
                  <p className="error">
                    Azure AD details are not in the API yet. Add the tenant id,
                    client id, and client secret in api/.env, set AUTH_MODE=azure,
                    then restart the API.
                  </p>
                )}
              </>
            ) : (
              <>
            <p className="lede">
              Enter your employee number and office email to continue.
            </p>

            <form className="login-form" onSubmit={onSubmit}>
              <label>
                Employee number
                <input
                  value={employeeNumber}
                  onChange={(e) => setEmployeeNumber(e.target.value)}
                  required
                  inputMode="numeric"
                  autoComplete="username"
                  maxLength={20}
                />
              </label>
              <label>
                Office email
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
                    <p className="muted small">
                      Example: 100001 and admin@example.com.
                    </p>
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
              </>
            )}
          </section>
        </div>
        <SiteCredit />
      </div>
    </div>
  );
}
