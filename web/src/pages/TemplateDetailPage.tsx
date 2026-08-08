import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, assetUrl, type TemplateSummary } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { resolveHtmlImageSrcsClient } from "../lib/htmlAssets";
import { CanvasPreview } from "../components/CanvasPreview";
import { COMPOSE_ENABLED, COMPOSE_UNAVAILABLE_REASON } from "../features";
import {
  importCanvaZipToTemplate,
  importDesignImageToTemplate,
  regenerateCanvaSnapshot,
} from "../lib/importDesign";
import { MergeFieldsGuide } from "../components/MergeFieldsGuide";
import { PlaceholderConfigPanel } from "../components/PlaceholderConfigPanel";
import { ImageSlotConfigPanel } from "../components/ImageSlotConfigPanel";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { Breadcrumbs, emailsCrumb } from "../components/Breadcrumbs";
import {
  FALLBACK_DEFAULT_SUBJECT,
  parseDefaultSubjectFromDesignJson,
  parseIgnoredPlaceholdersFromDesignJson,
  parsePlaceholdersFromDesignJson,
  syncPlaceholdersWithHtml,
  type PlaceholderDef,
} from "../lib/mergeFields";
import {
  parseImageSlotsFromDesignJson,
  syncImageSlotsWithHtml,
  type ImageSlotDef,
} from "../lib/imageSlots";
import { resolveMediaUrl, rewriteMediaUrlsInHtml } from "../lib/mediaUrl";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** Compose slot uploads used to land in Images as source; hide/purge those. */
function isComposeOverrideFileName(fileName: string) {
  return /-override-\d+x\d+\./i.test(fileName);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeKey(key: string) {
  return key.replace(/\\/g, "/");
}

function stripAssetFromHtml(html: string, fileName: string, storageKey: string) {
  const key = normalizeKey(storageKey);
  return html
    .replace(
      new RegExp(
        `<img\\b[^>]*src=["'][^"']*${escapeRegExp(fileName)}[^"']*["'][^>]*>`,
        "gi",
      ),
      "",
    )
    .replace(
      new RegExp(
        `<img\\b[^>]*src=["'][^"']*${escapeRegExp(key)}[^"']*["'][^>]*>`,
        "gi",
      ),
      "",
    )
    .replace(/\n{3,}/g, "\n\n");
}

function countDesignUses(
  designJson: Record<string, unknown> | null | undefined,
  storageKey: string,
  fileName: string,
) {
  if (!designJson) return 0;
  const key = normalizeKey(storageKey);
  const canvas = designJson.canvas as
    | { objects?: Array<Record<string, unknown>> }
    | undefined;
  const objects = canvas?.objects ?? [];
  let count = 0;
  for (const obj of objects) {
    const tagged =
      typeof obj.gratAssetKey === "string" ? normalizeKey(obj.gratAssetKey) : "";
    const src = typeof obj.src === "string" ? obj.src : "";
    if (
      tagged === key ||
      src.includes(key) ||
      src.includes(encodeURI(key)) ||
      src.includes(fileName)
    ) {
      count += 1;
    }
  }
  if (count === 0) {
    const blob = JSON.stringify(designJson);
    if (blob.includes(key) || blob.includes(fileName)) return 1;
  }
  return count;
}

function stripAssetFromDesign(
  designJson: Record<string, unknown>,
  storageKey: string,
  fileName: string,
) {
  const key = normalizeKey(storageKey);
  const next = structuredClone(designJson) as Record<string, unknown>;
  const canvas = next.canvas as
    | { objects?: Array<Record<string, unknown>> }
    | undefined;
  if (canvas?.objects) {
    canvas.objects = canvas.objects.filter((obj) => {
      const tagged =
        typeof obj.gratAssetKey === "string"
          ? normalizeKey(obj.gratAssetKey)
          : "";
      const src = typeof obj.src === "string" ? obj.src : "";
      const hit =
        tagged === key ||
        src.includes(key) ||
        src.includes(encodeURI(key)) ||
        src.includes(fileName);
      return !hit;
    });
  }
  if (typeof next.sourceHtml === "string") {
    next.sourceHtml = stripAssetFromHtml(next.sourceHtml, fileName, storageKey);
  }
  return next;
}

function htmlUsesAsset(html: string, fileName: string, storageKey: string) {
  const key = normalizeKey(storageKey);
  return (
    html.includes(fileName) ||
    html.includes(key) ||
    html.includes(encodeURI(key))
  );
}

export function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateSummary | null>(null);
  const [name, setName] = useState("");
  const [defaultSubject, setDefaultSubject] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "SHARED">("PRIVATE");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [placeholders, setPlaceholders] = useState<PlaceholderDef[]>([]);
  const [ignoredPlaceholders, setIgnoredPlaceholders] = useState<string[]>([]);
  const [imageSlots, setImageSlots] = useState<ImageSlotDef[]>([]);
  const [trimWhiteMargins, setTrimWhiteMargins] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [assetDeletePrompt, setAssetDeletePrompt] = useState<{
    id: string;
    fileName: string;
    storageKey: string;
    designUses: number;
    inHtml: boolean;
    clearsPreview: boolean;
  } | null>(null);

  const canEdit =
    !!template &&
    (template.owner.id === user?.id || user?.role === "ADMIN");

  async function reload() {
    if (!token || !id) return;
    const { template: t } = await api.template(token, id);
    setTemplate(t);
    setName(t.name);
    setVisibility(t.visibility);
    setCategoryId(t.category?.id ?? null);
    setHtml(t.versions[0]?.compiledHtml ?? "");
    setDefaultSubject(
      parseDefaultSubjectFromDesignJson(
        (t.versions[0]?.designJson ?? {}) as Record<string, unknown>,
      ),
    );
    setPlaceholders(
      parsePlaceholdersFromDesignJson(
        (t.versions[0]?.designJson ?? {}) as Record<string, unknown>,
      ),
    );
    setIgnoredPlaceholders(
      parseIgnoredPlaceholdersFromDesignJson(
        (t.versions[0]?.designJson ?? {}) as Record<string, unknown>,
      ),
    );
    setImageSlots(
      parseImageSlotsFromDesignJson(
        (t.versions[0]?.designJson ?? {}) as Record<string, unknown>,
      ),
    );
  }

  useEffect(() => {
    if (!token || !id) return;
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  const assets = (template?.assets ?? []).filter(
    (a) => !isComposeOverrideFileName(a.fileName),
  );
  const legacyComposeOverrides = (template?.assets ?? []).filter((a) =>
    isComposeOverrideFileName(a.fileName),
  );

  // Remove leftover Compose replacements that were wrongly stored as design images.
  useEffect(() => {
    if (!token || !id || !canEdit || legacyComposeOverrides.length === 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      for (const a of legacyComposeOverrides) {
        try {
          await api.deleteTemplateAsset(token, id, a.id, {
            invalidateCompiled: false,
          });
        } catch {
          /* best-effort cleanup */
        }
      }
      if (!cancelled) {
        try {
          await reload();
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id, canEdit, legacyComposeOverrides.length]);

  const latestMode =
    typeof template?.versions[0]?.designJson?.mode === "string"
      ? (template.versions[0].designJson.mode as string)
      : "blank";
  const latestDesignJson = (template?.versions[0]?.designJson ?? {}) as Record<
    string,
    unknown
  >;
  // Preview width from designJson or max-width in compiled HTML.
  const designPreviewWidth = useMemo(() => {
    const fromJson = latestDesignJson.width;
    if (typeof fromJson === "number" && fromJson >= 200) {
      return Math.round(fromJson);
    }
    const m = html.match(/max-width:\s*(\d+)px/i);
    if (m) {
      const w = Number(m[1]);
      if (Number.isFinite(w) && w >= 200) return w;
    }
    return 600;
  }, [latestDesignJson, html]);

  const designPreviewHeight = useMemo(() => {
    const fromJson = latestDesignJson.height;
    if (typeof fromJson === "number" && fromJson >= 200) {
      return Math.round(fromJson);
    }
    return 800;
  }, [latestDesignJson]);

  /** Compiled PNG snapshot — pixel-perfect Outlook paste for Canva imports */
  const previewImageUrl =
    resolveMediaUrl(template?.versions[0]?.previewUrl) || null;

  /** Canva: PNG paste matches design; HTML optional for selectable text. */
  const outlookPasteMode: "html" | "png" =
    latestMode === "canva_html" && previewImageUrl
      ? "png"
      : latestMode === "canva_html" || latestMode === "html_import"
        ? "html"
        : "png";

  const offerCanvaHtmlPaste =
    latestMode === "canva_html" && Boolean(previewImageUrl && html.trim());

  const htmlOnlyPreview =
    latestMode === "canva_html" || latestMode === "html_import";

  const modeLabel =
    latestMode === "canva_html"
      ? "Canva HTML"
      : latestMode === "image_import"
        ? "Image email"
        : latestMode === "html_import"
          ? "HTML"
          : latestMode === "designer"
            ? "Legacy (retired designer)"
            : "Blank";

  const previewHtml = useMemo(() => {
    return rewriteMediaUrlsInHtml(
      resolveHtmlImageSrcsClient(html, assets, API_URL),
    );
  }, [html, assets]);

  async function saveAll() {
    if (!token || !id) {
      setError("Not signed in.");
      return;
    }
    if (!canEdit) {
      setError("You do not have permission to edit this template.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await api.updateTemplate(token, id, {
        name: name.trim() || "Untitled",
        visibility,
        status: visibility === "SHARED" ? "PUBLISHED" : "DRAFT",
        categoryId,
      });
      const cleanedSubject = defaultSubject.trim().slice(0, 300);
      await api.saveTemplateVersion(token, id, {
        designJson: {
          ...latestDesignJson,
          defaultSubject: cleanedSubject,
        },
        compiledHtml: html,
        previewUrl: previewImageUrl,
      });
      await reload();
      setNotice("Saved settings.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteAsset(
    assetId: string,
    fileName: string,
    storageKey: string,
  ) {
    if (!token || !id || !canEdit || !template) {
      setError("Cannot delete — not signed in or no permission.");
      return;
    }

    const designJson = (template.versions[0]?.designJson ?? {}) as Record<
      string,
      unknown
    >;
    const designUses = countDesignUses(designJson, storageKey, fileName);
    const inHtml = htmlUsesAsset(html, fileName, storageKey);
    const hasCompiledPreview = Boolean(
      (template.versions[0]?.compiledHtml ?? "").trim(),
    );

    setAssetDeletePrompt({
      id: assetId,
      fileName,
      storageKey,
      designUses,
      inHtml,
      clearsPreview: designUses > 0 && hasCompiledPreview,
    });
  }

  async function confirmDeleteAsset() {
    if (!assetDeletePrompt || !token || !id || !canEdit || !template) return;
    const { id: assetId, fileName, storageKey, designUses, inHtml } =
      assetDeletePrompt;
    const designJson = (template.versions[0]?.designJson ?? {}) as Record<
      string,
      unknown
    >;
    const mode =
      typeof designJson.mode === "string" ? designJson.mode : "blank";
    const invalidateCompiled = designUses > 0;

    setAssetDeletePrompt(null);
    setError(null);
    setNotice(null);

    try {
      await api.deleteTemplateAsset(token, id, assetId, {
        invalidateCompiled,
      });

      const nextDesign = stripAssetFromDesign(designJson, storageKey, fileName);
      const nextHtml = stripAssetFromHtml(html, fileName, storageKey);

      if (designUses > 0) {
        await api.purgeCompiledAssets(token, id);
        await api.saveTemplateVersion(token, id, {
          designJson: {
            ...nextDesign,
            mode: nextDesign.mode ?? mode,
          },
          compiledHtml: "",
          previewUrl: null,
        });
        setHtml("");
      } else if (inHtml) {
        await api.saveTemplateVersion(token, id, {
          designJson: {
            mode: nextHtml.trim() ? "html_import" : "blank",
            sourceHtml: nextHtml,
          },
          compiledHtml: nextHtml,
        });
        setHtml(nextHtml);
      }

      await reload();
      setNotice(
        designUses > 0
          ? `Removed “${fileName}” from the card (${designUses} placement${designUses === 1 ? "" : "s"}) and cleared the email preview. Re-import the design to rebuild it.`
          : inHtml
            ? `Removed “${fileName}” from uploads and HTML.`
            : `Deleted image “${fileName}”.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete image failed");
    }
  }

  async function onReimportCanvaZip(file: File | null) {
    if (!token || !id || !file || !canEdit) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const {
        imageCount,
        previewUrl: importedPreview,
        placeholders: nextPh,
        imageSlots: nextSlots,
        trimmedWhiteMargins,
        snapshotError,
      } = await importCanvaZipToTemplate(token, id, file, {
          previousPlaceholders: placeholders,
          previousImageSlots: imageSlots,
          previousDesignJson: latestDesignJson,
          ignoredPlaceholders,
          trimWhiteMargins,
          defaultSubject,
        });
      await reload();
      const notes: string[] = [];
      if (nextPh.length > 0) {
        notes.push(
          `Define ${nextPh.length} placeholder${nextPh.length === 1 ? "" : "s"}`,
        );
      }
      if (nextSlots.length > 0) {
        notes.push(
          `configure ${nextSlots.length} image slot${nextSlots.length === 1 ? "" : "s"}`,
        );
      }
      const phNote = notes.length ? ` ${notes.join(" and ")} below.` : "";
      const trimNote = trimmedWhiteMargins
        ? " White top/bottom margins were trimmed."
        : trimWhiteMargins
          ? " (No solid white margins found to trim.)"
          : "";
      const failDetail = snapshotError ? ` (${snapshotError})` : "";
      setNotice(
        importedPreview
          ? `Imported Canva ZIP (${imageCount} image${imageCount === 1 ? "" : "s"}) with PNG snapshot.${trimNote}${phNote}`
          : `Imported Canva ZIP (${imageCount} image${imageCount === 1 ? "" : "s"}). PNG snapshot failed${failDetail} — re-import to retry.${trimNote}${phNote}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Canva import failed");
    } finally {
      setSaving(false);
    }
  }

  async function savePlaceholders() {
    if (!token || !id || !canEdit || !template) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const cleaned = placeholders.map((p) => ({
        key: p.key,
        label: p.label.trim() || p.key,
        source: p.source,
      }));
      const cleanedSlots = imageSlots.map((s) => ({
        ...s,
        label: s.label.trim() || s.id,
      }));
      await api.saveTemplateVersion(token, id, {
        designJson: {
          ...latestDesignJson,
          placeholders: cleaned,
          ignoredPlaceholders,
          imageSlots: cleanedSlots,
          defaultSubject: defaultSubject.trim().slice(0, 300),
        },
        compiledHtml: html,
        previewUrl: previewImageUrl,
      });
      await reload();
      setNotice(
        cleaned.length
          ? `Saved ${cleaned.length} placeholder definition${cleaned.length === 1 ? "" : "s"}.`
          : "Saved placeholder definitions (none active).",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save placeholders",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveImageSlots() {
    if (!token || !id || !canEdit || !template) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const cleaned = placeholders.map((p) => ({
        key: p.key,
        label: p.label.trim() || p.key,
        source: p.source,
      }));
      const cleanedSlots = imageSlots.map((s) => ({
        ...s,
        label: s.label.trim() || s.id,
      }));
      await api.saveTemplateVersion(token, id, {
        designJson: {
          ...latestDesignJson,
          placeholders: cleaned,
          ignoredPlaceholders,
          imageSlots: cleanedSlots,
          defaultSubject: defaultSubject.trim().slice(0, 300),
        },
        compiledHtml: html,
        previewUrl: previewImageUrl,
      });
      await reload();
      setNotice(
        cleanedSlots.length
          ? `Saved ${cleanedSlots.length} image slot setting${cleanedSlots.length === 1 ? "" : "s"}.`
          : "Saved image slot settings (none detected).",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save image slots",
      );
    } finally {
      setSaving(false);
    }
  }

  function rescanPlaceholders() {
    const next = syncPlaceholdersWithHtml(
      html,
      placeholders,
      ignoredPlaceholders,
    );
    setPlaceholders(next);
    setNotice(
      next.length
        ? `Found ${next.length} placeholder${next.length === 1 ? "" : "s"} in HTML. Review labels and “Filled how”, then Save.`
        : ignoredPlaceholders.length
          ? "No active placeholders — all detected tokens are in Removed, or none found in HTML."
          : "No {{placeholders}} found in the current HTML.",
    );
  }

  function restoreIgnoredPlaceholder(key: string) {
    const nextIgnored = ignoredPlaceholders.filter(
      (k) => k.toLowerCase() !== key.toLowerCase(),
    );
    setIgnoredPlaceholders(nextIgnored);
    const next = syncPlaceholdersWithHtml(html, placeholders, nextIgnored);
    setPlaceholders(next);
    setNotice(
      `Restored {{${key}}}. Review it above, then Save placeholder definitions.`,
    );
  }

  function rescanImageSlots() {
    const { slots, html: nextHtml } = syncImageSlotsWithHtml(html, imageSlots);
    setImageSlots(slots);
    setHtml(nextHtml);
    setNotice(
      slots.length
        ? `Found ${slots.length} image${slots.length === 1 ? "" : "s"} in HTML. Review labels and replace mode, then Save.`
        : "No content images found in the current HTML.",
    );
  }

  async function onRegenerateCanvaSnapshot() {
    if (!token || !id || !canEdit || !html.trim()) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await regenerateCanvaSnapshot(token, id, html, latestDesignJson);
      await reload();
      setNotice("Regenerated PNG snapshot from Canva HTML for Outlook paste.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not build PNG snapshot",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onReimportDesignImage(file: File | null) {
    if (!token || !id || !file || !canEdit) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await importDesignImageToTemplate(
        token,
        id,
        file,
        name.trim() || "Gratitude card",
        {
          previousImageSlots: imageSlots,
          previousDesignJson: latestDesignJson,
          defaultSubject,
        },
      );
      await reload();
      setNotice(
        "Uploaded image email. Looks correct in Outlook; text is not selectable. Configure the image slot below if Compose should allow replacements.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image import failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteTemplate() {
    if (!token || !id || !canEdit) return;
    if (pendingDeleteId !== "template") {
      setPendingDeleteId("template");
      setNotice("Click Delete template again to confirm.");
      return;
    }
    setPendingDeleteId(null);
    try {
      await api.deleteTemplate(token, id);
      navigate("/cards");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (!template && !error) {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link to="/cards">Back</Link>
      </div>
    );
  }

  const latest = template.versions[0];
  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          emailsCrumb,
          { label: "My Designs", to: "/cards" },
          { label: template.name },
        ]}
      />
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">My Designs</p>
          <h1>{template.name}</h1>
          <p className="lede">
            owned by {template.owner.displayName} · v{latest?.version ?? 1}
            {" · "}
            {modeLabel}
          </p>
        </div>
        <div className="surface-actions">
          {COMPOSE_ENABLED ? (
            <Link to={`/cards/${template.id}/compose`} className="btn-link">
              Compose
            </Link>
          ) : (
            <span
              className="btn-link btn-link-disabled"
              title={COMPOSE_UNAVAILABLE_REASON}
              aria-disabled="true"
            >
              Compose
            </span>
          )}
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <div className="panel form-stack">
        <h2 className="card-section-title">Card settings</h2>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit}
            maxLength={160}
          />
        </label>

        <label>
          Default subject
          <input
            value={defaultSubject}
            onChange={(e) => setDefaultSubject(e.target.value)}
            disabled={!canEdit}
            maxLength={300}
            placeholder={FALLBACK_DEFAULT_SUBJECT}
          />
        </label>
        <p className="muted small">
          Compose starts with this subject for every send. Use placeholders like{" "}
          <code>{"{{recipientName}}"}</code>. Leave blank to use{" "}
          <code>{FALLBACK_DEFAULT_SUBJECT}</code>.
        </p>

        <label>
          Visibility
          <select
            value={visibility}
            onChange={(e) =>
              setVisibility(e.target.value as "PRIVATE" | "SHARED")
            }
            disabled={!canEdit}
          >
            <option value="PRIVATE">Private</option>
            <option value="SHARED">Published</option>
          </select>
        </label>
        {token ? (
          <div className="category-settings">
            <CategoryCombobox
              token={token}
              value={categoryId}
              onChange={(id) => setCategoryId(id)}
              disabled={!canEdit || saving}
              allowClear={false}
              allowCreate
            />
            <p className="muted small">
              Pick any designer’s category for this template. Rename or delete
              categories you created in Design studio → Categories.
            </p>
          </div>
        ) : null}
        <p className="muted small">
          <strong>Published</strong> lists this card in the marketplace.{" "}
          <strong>Private</strong> keeps it in your design studio only.
        </p>

        <div className="surface-panel">
          {latestMode === "canva_html" ? (
            <>
              <p className="muted">
                Imported from <strong>Canva HTML ZIP</strong>.{" "}
                <strong>Copy for Outlook</strong> uses a{" "}
                <strong>PNG snapshot</strong> so paste matches Canva (text not
                selectable). Use <strong>Compose</strong> to send the real HTML
                via the server — closer to Canva in most inboxes. Optional:{" "}
                <strong>Copy HTML</strong> in the preview modal for manual paste
                (selectable text, layout may shift in Outlook).
              </p>
              <ol className="steps-list muted small">
                <li>
                  In Canva: Email design → Share → Download →{" "}
                  <strong>HTML and images</strong> (ZIP).
                </li>
                <li>
                  Optional: put your own placeholders in Canva text (e.g.{" "}
                  <code>{"{{heroName}}"}</code>). After import, define
                  placeholders and image slots below — Compose fills values and
                  optional image swaps per send without changing the saved
                  template.
                </li>
                <li>Re-import below to replace this design.</li>
              </ol>
              <MergeFieldsGuide compact />
              {canEdit ? (
                <div className="surface-actions import-actions">
                  <label className="check import-trim-option">
                    <input
                      type="checkbox"
                      checked={trimWhiteMargins}
                      disabled={saving}
                      onChange={(e) => setTrimWhiteMargins(e.target.checked)}
                    />
                    <span>
                      Trim white margins above and below
                      <span className="muted small import-trim-hint">
                        {" "}
                        when importing (Canva letterboxing)
                      </span>
                    </span>
                  </label>
                  <label className={`file-pick ${saving ? "is-disabled" : ""}`}>
                    <input
                      type="file"
                      accept=".zip,application/zip"
                      disabled={saving}
                      onChange={(e) => {
                        void onReimportCanvaZip(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                    <span className="file-pick-btn">
                      {saving ? "Importing…" : "Replace Canva ZIP"}
                    </span>
                  </label>
                  {!previewImageUrl ? (
                    <button
                      type="button"
                      className="ghost"
                      disabled={saving}
                      onClick={() => void onRegenerateCanvaSnapshot()}
                    >
                      {saving ? "Building…" : "Build PNG snapshot"}
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="muted">View only — you don’t own this template.</p>
              )}
            </>
          ) : latestMode === "image_import" ? (
            <>
              <p className="muted">
                This card is an <strong>image email</strong> (PNG/PDF fallback).
                Looks correct in Outlook; <strong>text is not selectable</strong>.
                For selectable text, create a new card from a Canva HTML ZIP.
              </p>
              {canEdit ? (
                <div className="surface-actions import-actions">
                  <label className={`file-pick ${saving ? "is-disabled" : ""}`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf"
                      disabled={saving}
                      onChange={(e) => {
                        void onReimportDesignImage(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                    <span className="file-pick-btn">
                      {saving ? "Uploading…" : "Replace image / PDF"}
                    </span>
                  </label>
                </div>
              ) : (
                <p className="muted">View only — you don’t own this template.</p>
              )}
            </>
          ) : (
            <>
              <p className="muted">
                {latestMode === "designer"
                  ? "This card was made in the retired freeform designer. Preview still works if HTML is saved. For selectable text, replace with a Canva HTML ZIP or create a new Canva card."
                  : "No Canva import yet. Upload a Canva HTML ZIP for selectable text, or an image/PDF for a picture-only card."}
              </p>
              {canEdit ? (
                <div className="surface-actions import-actions">
                  <label className="check import-trim-option">
                    <input
                      type="checkbox"
                      checked={trimWhiteMargins}
                      disabled={saving}
                      onChange={(e) => setTrimWhiteMargins(e.target.checked)}
                    />
                    <span>
                      Trim white margins above and below
                      <span className="muted small import-trim-hint">
                        {" "}
                        when importing (Canva letterboxing)
                      </span>
                    </span>
                  </label>
                  <label className={`file-pick ${saving ? "is-disabled" : ""}`}>
                    <input
                      type="file"
                      accept=".zip,application/zip"
                      disabled={saving}
                      onChange={(e) => {
                        void onReimportCanvaZip(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                    <span className="file-pick-btn">
                      {saving ? "Importing…" : "Import Canva ZIP"}
                    </span>
                  </label>
                  <label className={`file-pick ${saving ? "is-disabled" : ""}`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf"
                      disabled={saving}
                      onChange={(e) => {
                        void onReimportDesignImage(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                    <span className="file-pick-btn">
                      {saving ? "Uploading…" : "Upload image / PDF"}
                    </span>
                  </label>
                </div>
              ) : (
                <p className="muted">View only — you don’t own this template.</p>
              )}
            </>
          )}
        </div>

        {canEdit ? (
          <div className="actions">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveAll()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="danger"
              disabled={saving}
              onClick={() => void onDeleteTemplate()}
            >
              {pendingDeleteId === "template"
                ? "Click again to confirm delete"
                : "Delete template"}
            </button>
          </div>
        ) : (
          <p className="muted">View only — you don’t own this shared template.</p>
        )}
      </div>

      {(html.trim() || placeholders.length > 0) &&
      (latestMode === "canva_html" ||
        latestMode === "html_import" ||
        latestMode === "blank" ||
        latestMode === "designer") ? (
        <PlaceholderConfigPanel
          placeholders={placeholders}
          canEdit={canEdit}
          saving={saving}
          onChange={setPlaceholders}
          ignoredKeys={ignoredPlaceholders}
          onIgnoredChange={setIgnoredPlaceholders}
          onRestoreIgnored={restoreIgnoredPlaceholder}
          onSave={() => void savePlaceholders()}
          onRescan={rescanPlaceholders}
        />
      ) : null}

      {(html.trim() || imageSlots.length > 0) &&
      (latestMode === "canva_html" ||
        latestMode === "html_import" ||
        latestMode === "image_import" ||
        latestMode === "blank" ||
        latestMode === "designer") ? (
        <ImageSlotConfigPanel
          slots={imageSlots}
          canEdit={canEdit}
          saving={saving}
          onChange={setImageSlots}
          onSave={() => void saveImageSlots()}
          onRescan={rescanImageSlots}
        />
      ) : null}

      {(previewImageUrl || previewHtml.trim()) ? (
        <CanvasPreview
          width={designPreviewWidth}
          height={designPreviewHeight}
          pngUrl={previewImageUrl}
          html={previewHtml}
          versionKey={template?.versions[0]?.version}
          pasteMode={outlookPasteMode}
          offerHtmlPaste={offerCanvaHtmlPaste}
          htmlOnly={htmlOnlyPreview}
        />
      ) : null}

      <section className="panel">
        <h2>Images</h2>
        <p className="muted">
          Design images from your Canva ZIP (or image upload). Compose
          replacements for a send are stored separately and do not appear here.
          Prefer Replace Canva ZIP / Replace image for layout changes.
        </p>
        <ul className="asset-list">
          {assets.map((a) => (
            <li key={a.id}>
              <div className="asset-main">
                <a
                  href={assetUrl(a.storageKey)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {a.fileName}
                </a>
                <span className="meta">{(a.byteSize / 1024).toFixed(1)} KB</span>
              </div>
              {canEdit ? (
                <div className="asset-actions">
                  <button
                    type="button"
                    className="ghost danger-text"
                    onClick={() =>
                      void onDeleteAsset(a.id, a.fileName, a.storageKey)
                    }
                  >
                    {pendingDeleteId === a.id
                      ? "Click again to confirm"
                      : "Delete"}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {assets.length === 0 ? (
          <p className="muted">No images on this card yet.</p>
        ) : null}
      </section>

      {assetDeletePrompt ? (
        <div
          className="app-modal-backdrop"
          role="presentation"
          onClick={() => setAssetDeletePrompt(null)}
        >
          <div
            className="app-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="detail-asset-del-title"
            aria-describedby="detail-asset-del-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="detail-asset-del-title">Remove uploaded image?</h2>
            <p id="detail-asset-del-desc">
              {assetDeletePrompt.designUses > 0 || assetDeletePrompt.inHtml ? (
                <>
                  <strong>{assetDeletePrompt.fileName}</strong> is used on this
                  card
                  {assetDeletePrompt.designUses > 0
                    ? ` (${assetDeletePrompt.designUses} placement${assetDeletePrompt.designUses === 1 ? "" : "s"})`
                    : ""}
                  {assetDeletePrompt.inHtml ? " and in the HTML body" : ""}.
                  Removing it will delete those inclusions
                  {assetDeletePrompt.designUses > 0
                    ? " and clear the compiled email preview"
                    : ""}
                  .
                </>
              ) : (
                <>
                  Remove <strong>{assetDeletePrompt.fileName}</strong> from
                  uploads? It does not appear to be used on the card right now.
                </>
              )}
            </p>
            <div className="app-modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setAssetDeletePrompt(null)}
              >
                Keep file
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => void confirmDeleteAsset()}
              >
                {assetDeletePrompt.designUses > 0 || assetDeletePrompt.inHtml
                  ? "Remove and update card"
                  : "Remove file"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
