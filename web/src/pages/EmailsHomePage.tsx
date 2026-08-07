import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { canManageDesigns, isAdmin, roleLabel } from "../lib/roles";
import { COMPOSE_ENABLED } from "../features";
import { Breadcrumbs } from "../components/Breadcrumbs";

/** Dedicated Emails hub — only email tools, filtered by role. */
export function EmailsHomePage() {
  const { user } = useAuth();

  return (
    <div className="page">
      <Breadcrumbs
        items={[{ label: "Home", to: "/" }, { label: "Emails" }]}
      />
      <header className="page-header">
        <div>
          <p className="eyebrow">Emails - {roleLabel(user?.role ?? "USER")}</p>
          <h1>Emails</h1>
          <p className="lede">
            {canManageDesigns(user)
              ? "Browse templates, manage your designs, send cards, and review history."
              : "Browse templates, favorite cards, and send personalized thanks."}
          </p>
        </div>
      </header>

      <div className="catalog-grid">
        <Link to="/marketplace" className="catalog-tile catalog-tile--live">
          <span className="catalog-type">TEMPLATES</span>
          <h2>Templates</h2>
          <p>Browse published cards, preview, and favorite for later.</p>
        </Link>

        {canManageDesigns(user) ? (
          <Link to="/cards" className="catalog-tile catalog-tile--live">
            <span className="catalog-type">DESIGNS</span>
            <h2>My Designs</h2>
            <p>Create and edit templates. Publish to list them for everyone.</p>
          </Link>
        ) : null}

        {COMPOSE_ENABLED ? (
          <Link to="/sent" className="catalog-tile catalog-tile--live">
            <span className="catalog-type">SENT</span>
            <h2>Sent History</h2>
            <p>Summary of what you sent, with a preview per recipient.</p>
          </Link>
        ) : null}

        {isAdmin(user) ? (
          <Link to="/admin" className="catalog-tile catalog-tile--live">
            <span className="catalog-type">ADMIN</span>
            <h2>Admin Panel</h2>
            <p>
              Send summary, people & roles, and a detailed audit log.
            </p>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
