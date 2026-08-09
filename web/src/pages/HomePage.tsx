import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { roleLabel } from "../lib/roles";

/** App home - brand-forward entry into Cards. */
export function HomePage() {
  const { user } = useAuth();

  return (
    <div className="page home-page">
      <section className="home-hero">
        <p className="eyebrow">Welcome · {roleLabel(user?.role ?? "USER")}</p>
        <h1 className="home-brand">Gratitude</h1>
        <p className="home-lede">
          Send appreciation to colleagues in a few clicks.
        </p>
      </section>

      <div className="home-paths">
        <Link
          to="/emails"
          className="home-path home-path--primary"
          data-tour="home-cards"
        >
          <span className="home-path-label">Start here</span>
          <h2>Cards</h2>
          <p>Browse, create, and send thank-you cards.</p>
        </Link>
        <div className="home-path home-path--muted" aria-disabled="true">
          <span className="home-path-label">Coming soon</span>
          <h2>Gifts</h2>
          <p>Physical gifts and recognition programs.</p>
        </div>
      </div>
    </div>
  );
}
