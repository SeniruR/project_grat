import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  importCanvaZipToTemplate,
  importDesignImageToTemplate,
  scanCanvaZipPlaceholders,
} from "../lib/importDesign";
import { MergeFieldsGuide } from "../components/MergeFieldsGuide";
import { PlaceholderConfigPanel } from "../components/PlaceholderConfigPanel";
import { ImageSlotConfigPanel } from "../components/ImageSlotConfigPanel";
import type { PlaceholderDef } from "../lib/mergeFields";
import type { ImageSlotDef } from "../lib/imageSlots";

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
  const [placeholders, setPlaceholders] = useState<PlaceholderDef[]>([]);
  const [ignoredPlaceholders, setIgnoredPlaceholders] = useState<string[]>([]);
  const [imageSlots, setImageSlots] = useState<ImageSlotDef[]>([]);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function resetZipScan() {
    setPlaceholders([]);
    setIgnoredPlaceholders([]);
    setImageSlots([]);
    setScanNotice(null);
  }

  async function onZipSelected(file: File | null) {
    setZipFile(file);
    setError(null);
    resetZipScan();
    if (!file) return;

    setScanning(true);
    try {
      const { placeholders: found, imageSlots: slots, htmlPath } =
        await scanCanvaZipPlaceholders(file);
      setPlaceholders(found);
      setImageSlots(slots);
      const parts: string[] = [];
      if (found.length > 0) {
        parts.push(
          `${found.length} placeholder${found.length === 1 ? "" : "s"}`,
        );
      }
      if (slots.length > 0) {
        parts.push(`${slots.length} image${slots.length === 1 ? "" : "s"}`);
      }
      setScanNotice(
        parts.length > 0
          ? `Scanned ${htmlPath}: found ${parts.join(" and ")}. Define them below, then Save.`
          : `Scanned ${htmlPath}: no placeholders or images found. You can still Save, or adjust the Canva export and choose the ZIP again.`,
      );
    } catch (err) {
      setZipFile(null);
      resetZipScan();
      setError(
        err instanceof Error
          ? err.message
          : "Could not read that ZIP. Use Canva’s HTML and images export.",
      );
      if (zipInputRef.current) zipInputRef.current.value = "";
    } finally {
      setScanning(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);

    if (starter === "canva_zip") {
      if (!zipFile) {
        setError("Choose a Canva HTML ZIP to import.");
        return;
      }
      if (scanning) {
        setError("Still scanning the ZIP — wait a moment.");
        return;
      }
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
      });

      if (starter === "canva_zip" && zipFile) {
        const cleaned = placeholders.map((p) => ({
          key: p.key,
          label: p.label.trim() || p.key,
          source: p.source,
        }));
        const cleanedSlots = imageSlots.map((s) => ({
          ...s,
          label: s.label.trim() || s.id,
        }));
        await importCanvaZipToTemplate(token, template.id, zipFile, {
          previousPlaceholders: cleaned,
          previousImageSlots: cleanedSlots,
          ignoredPlaceholders,
        });
        navigate("/cards");
        return;
      }

      if (starter === "image_upload" && imageFile) {
        await importDesignImageToTemplate(
          token,
          template.id,
          imageFile,
          name.trim() || "Gratitude card",
        );
        navigate("/cards");
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
          Design in Canva, choose the ZIP here to scan placeholders and images,
          define them, then <strong>Save</strong> — you’ll return to your
          templates list (Compose is separate, when you send).
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
            disabled={saving}
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
                  disabled={saving}
                  onChange={() => {
                    setStarter(s.id);
                    setError(null);
                    if (s.id !== "canva_zip") {
                      setZipFile(null);
                      resetZipScan();
                      if (zipInputRef.current) zipInputRef.current.value = "";
                    }
                    if (s.id !== "image_upload") {
                      setImageFile(null);
                      if (imageInputRef.current) imageInputRef.current.value = "";
                    }
                  }}
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
                Type any placeholder as normal text, e.g.{" "}
                <code>{"{{heroName}}"}</code> or <code>{"{{eventTitle}}"}</code>.
              </li>
              <li>
                <strong>Share → Download → HTML and images</strong> (ZIP).
              </li>
              <li>
                Choose the ZIP below — placeholders and images are scanned
                immediately (no separate import step).
              </li>
            </ol>
            <label
              className={`file-pick ${saving || scanning ? "is-disabled" : ""}`}
            >
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip"
                disabled={saving || scanning}
                onChange={(e) => {
                  void onZipSelected(e.target.files?.[0] ?? null);
                }}
              />
              <span className="file-pick-btn">
                {scanning ? "Scanning ZIP…" : "Choose Canva ZIP"}
              </span>
              <span className="file-pick-name muted">
                {zipFile ? zipFile.name : "HTML and images ZIP"}
              </span>
            </label>
            {scanNotice ? <p className="notice">{scanNotice}</p> : null}
            <MergeFieldsGuide />
            {zipFile && !scanning ? (
              <>
                <PlaceholderConfigPanel
                  placeholders={placeholders}
                  canEdit={!saving}
                  saving={saving}
                  onChange={setPlaceholders}
                  ignoredKeys={ignoredPlaceholders}
                  onIgnoredChange={setIgnoredPlaceholders}
                  onRestoreIgnored={(key) => {
                    const nextIgnored = ignoredPlaceholders.filter(
                      (k) => k.toLowerCase() !== key.toLowerCase(),
                    );
                    setIgnoredPlaceholders(nextIgnored);
                    void scanCanvaZipPlaceholders(zipFile!).then(
                      ({ placeholders: found }) => {
                        const prevByKey = new Map(
                          placeholders.map((p) => [
                            p.key.toLowerCase(),
                            p,
                          ] as const),
                        );
                        setPlaceholders(
                          found
                            .filter(
                              (p) =>
                                !nextIgnored.some(
                                  (k) => k.toLowerCase() === p.key.toLowerCase(),
                                ),
                            )
                            .map((p) => prevByKey.get(p.key.toLowerCase()) ?? p),
                        );
                      },
                    );
                  }}
                  showActions={false}
                  title="Define placeholders"
                  description="Found in your ZIP. Set a meaning and how Compose should fill each one. Remove any that were detected by mistake. Then press Save at the bottom."
                />
                <ImageSlotConfigPanel
                  slots={imageSlots}
                  canEdit={!saving}
                  saving={saving}
                  onChange={setImageSlots}
                  showActions={false}
                  title="Define image slots"
                  description="Mark images Compose may replace. Fixed keeps the Canva image; shared or per-person lets senders upload a new picture fitted to the designed size."
                />
              </>
            ) : null}
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
              disabled={saving}
            />
            Private — only you (and admins)
          </label>
          <label className="check">
            <input
              type="radio"
              name="visibility"
              checked={visibility === "SHARED"}
              onChange={() => setVisibility("SHARED")}
              disabled={saving}
            />
            Shared — visible to everyone in the org
          </label>
        </fieldset>

        {error ? <p className="error">{error}</p> : null}

        <div className="actions">
          <button type="submit" disabled={saving || scanning}>
            {saving
              ? starter === "canva_zip"
                ? "Saving template…"
                : "Uploading…"
              : scanning
                ? "Scanning ZIP…"
                : "Save"}
          </button>
          <Link to="/cards" className="ghost-link">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
