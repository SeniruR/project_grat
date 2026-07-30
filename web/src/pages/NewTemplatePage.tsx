import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  importCanvaZipToTemplate,
  importDesignImageToTemplate,
} from "../lib/importDesign";

type Starter = "canva_zip" | "image_upload";

const STARTERS: Array<{
  id: Starter;
  title: string;
  blurb: string;
  detail: string;
}> = [
  {
    id: "canva_zip",
    title: "Import from Canva",
    blurb: "HTML ZIP — selectable text",
    detail:
      "Best path for Outlook text like LinkedIn. In Canva: Email design → Share → Download → HTML and images (ZIP).",
  },
  {
    id: "image_upload",
    title: "Upload image",
    blurb: "PNG / JPEG / PDF",
    detail:
      "Looks correct in Outlook; text is not selectable. PDF uses page 1 only.",
  },
];

export function NewTemplatePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "SHARED">("PRIVATE");
  const [starter, setStarter] = useState<Starter>("canva_zip");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [headerHtml, setHeaderHtml] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);

    if (starter === "canva_zip" && !zipFile) {
      setError("Choose a Canva HTML ZIP to import.");
      return;
    }
    if (starter === "image_upload" && !imageFile) {
      setError("Choose a PNG, JPEG, or PDF to upload.");
      return;
    }

    setSaving(true);
    try {
      const createMode =
        starter === "canva_zip" ? "canva_html" : "image_import";

      const { template } = await api.createTemplate(token, {
        name,
        visibility,
        mode: createMode,
        headerHtml: headerHtml.trim() || undefined,
        footerHtml: footerHtml.trim() || undefined,
      });

      if (starter === "canva_zip" && zipFile) {
        await importCanvaZipToTemplate(token, template.id, zipFile);
        navigate(`/cards/${template.id}`);
        return;
      }

      if (starter === "image_upload" && imageFile) {
        await importDesignImageToTemplate(
          token,
          template.id,
          imageFile,
          name.trim() || "Gratitude card",
        );
        navigate(`/cards/${template.id}`);
        return;
      }
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
          Design in Canva, then import an{" "}
          <strong>HTML and images</strong> ZIP for selectable text in Outlook.
          Or upload a PNG/PDF if you only need a picture.
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
          <legend>How do you want to start?</legend>
          <div className="starter-grid" role="radiogroup" aria-label="Starter">
            {STARTERS.map((s) => (
              <label
                key={s.id}
                className={`starter-card ${starter === s.id ? "is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="starter"
                  value={s.id}
                  checked={starter === s.id}
                  onChange={() => setStarter(s.id)}
                />
                <span className="starter-card-title">{s.title}</span>
                <span className="starter-card-blurb">{s.blurb}</span>
                <span className="starter-card-detail muted small">{s.detail}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {starter === "canva_zip" ? (
          <div className="import-panel">
            <h3 className="card-section-title">Canva export steps</h3>
            <ol className="steps-list">
              <li>
                In Canva, create an <strong>Email</strong> design (not a poster).
              </li>
              <li>Prefer text boxes and layout blocks — not one flattened image.</li>
              <li>
                <strong>Share → Download → HTML and images</strong> (ZIP).
              </li>
              <li>Upload that ZIP below.</li>
            </ol>
            <label className={`file-pick ${saving ? "is-disabled" : ""}`}>
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip"
                disabled={saving}
                onChange={(e) => {
                  setZipFile(e.target.files?.[0] ?? null);
                }}
              />
              <span className="file-pick-btn">Choose Canva ZIP</span>
              <span className="file-pick-name muted">
                {zipFile ? zipFile.name : "HTML and images ZIP"}
              </span>
            </label>
          </div>
        ) : null}

        {starter === "image_upload" ? (
          <div className="import-panel">
            <p className="muted">
              Upload a PNG, JPEG, GIF, WebP, or PDF. Outlook paste will use an
              image in a simple table — looks correct; text is not selectable.
            </p>
            <label className={`file-pick ${saving ? "is-disabled" : ""}`}>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf"
                disabled={saving}
                onChange={(e) => {
                  setImageFile(e.target.files?.[0] ?? null);
                }}
              />
              <span className="file-pick-btn">Choose image or PDF</span>
              <span className="file-pick-name muted">
                {imageFile ? imageFile.name : "PNG, JPEG, or PDF (page 1)"}
              </span>
            </label>
          </div>
        ) : null}

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

        <details className="card-advanced">
          <summary>Optional header / footer HTML</summary>
          <div className="card-advanced-body form-stack">
            <label>
              Header HTML
              <textarea
                value={headerHtml}
                onChange={(e) => setHeaderHtml(e.target.value)}
                rows={3}
                placeholder="Company banner snippet (optional)"
              />
            </label>
            <label>
              Footer HTML
              <textarea
                value={footerHtml}
                onChange={(e) => setFooterHtml(e.target.value)}
                rows={3}
                placeholder="Disclaimer / signature block (optional)"
              />
            </label>
          </div>
        </details>

        {error ? <p className="error">{error}</p> : null}

        <div className="actions">
          <button type="submit" disabled={saving}>
            {saving
              ? starter === "canva_zip"
                ? "Importing…"
                : "Uploading…"
              : starter === "canva_zip"
                ? "Import Canva ZIP"
                : "Upload image"}
          </button>
          <Link to="/cards" className="ghost-link">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
