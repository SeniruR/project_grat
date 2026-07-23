import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function NewTemplatePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "SHARED">("PRIVATE");
  const [html, setHtml] = useState("");
  const [headerHtml, setHeaderHtml] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      const starter = html.trim();
      const { template } = await api.createTemplate(token, {
        name,
        visibility,
        mode: starter ? "html_import" : "blank",
        html: starter || undefined,
        headerHtml: headerHtml.trim() || undefined,
        footerHtml: footerHtml.trim() || undefined,
      });
      navigate(`/cards/${template.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <p className="back">
        <Link to="/cards">← Templates</Link>
      </p>
      <header className="page-header">
        <p className="eyebrow">Cards</p>
        <h1>New template</h1>
        <p className="lede">
          Create a card, then switch between <strong>Designer</strong> and{" "}
          <strong>HTML</strong> anytime on the template page.
        </p>
      </header>

      <form className="panel form-stack" onSubmit={onSubmit}>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={160}
            placeholder="Q3 thank-you card"
          />
        </label>

        <fieldset className="choice-set">
          <legend>Visibility</legend>
          <label className="check">
            <input
              type="radio"
              name="visibility"
              checked={visibility === "PRIVATE"}
              onChange={() => setVisibility("PRIVATE")}
            />
            Private — only you (and admins)
          </label>
          <label className="check">
            <input
              type="radio"
              name="visibility"
              checked={visibility === "SHARED"}
              onChange={() => setVisibility("SHARED")}
            />
            Shared — visible to everyone in the org
          </label>
        </fieldset>

        <label>
          Starting email HTML{" "}
          <span className="optional-tag">(optional)</span>
          <span className="field-hint">
            Leave empty to start blank, then use Designer or paste HTML later.
          </span>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder="Optional HTML to start from…"
          />
        </label>

        <label>
          Optional header HTML
          <textarea
            value={headerHtml}
            onChange={(e) => setHeaderHtml(e.target.value)}
            rows={3}
            placeholder="Company banner snippet (optional)"
          />
        </label>
        <label>
          Optional footer HTML
          <textarea
            value={footerHtml}
            onChange={(e) => setFooterHtml(e.target.value)}
            rows={3}
            placeholder="Disclaimer / signature block (optional)"
          />
        </label>

        {error ? <p className="error">{error}</p> : null}

        <div className="actions">
          <button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create template"}
          </button>
          <Link to="/cards" className="ghost-link">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
