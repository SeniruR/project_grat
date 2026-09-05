import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useBlocker,
  useNavigate,
  useParams,
} from "react-router-dom";
import { api, type TemplateSummary } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { resolveHtmlImageSrcsClient } from "../lib/htmlAssets";
import { CanvasPreview } from "../components/CanvasPreview";
import { COMPOSE_ENABLED, COMPOSE_UNAVAILABLE_REASON } from "../features";
import {
  importCanvaZipToTemplate,
  importDesignImageToTemplate,
  regenerateCanvaSnapshot,
} from "../lib/importDesign";
import { PlaceholderConfigPanel } from "../components/PlaceholderConfigPanel";
import { ImageSlotConfigPanel } from "../components/ImageSlotConfigPanel";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { Breadcrumbs, emailsCrumb, myCardsCrumb } from "../components/Breadcrumbs";
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

type EditSnapshot = {
  name: string;
  defaultSubject: string;
  visibility: "PRIVATE" | "SHARED";
  categoryId: string | null;
  html: string;
  placeholders: PlaceholderDef[];
  ignoredPlaceholders: string[];
  imageSlots: ImageSlotDef[];
};

function snapshotKey(s: EditSnapshot) {
  return JSON.stringify({
    name: s.name,
    defaultSubject: s.defaultSubject,
    visibility: s.visibility,
    categoryId: s.categoryId,
    html: s.html,
    placeholders: s.placeholders,
    ignoredPlaceholders: s.ignoredPlaceholders,
    imageSlots: s.imageSlots,
  });
}

/** Compose slot uploads used to land as source assets; hide/purge those. */
function isComposeOverrideFileName(fileName: string) {
  return /-override-\d+x\d+\./i.test(fileName);
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
  const [pendingZipFile, setPendingZipFile] = useState<File | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [savedSnap, setSavedSnap] = useState<EditSnapshot | null>(null);
  const skipLeaveGuard = useRef(false);
  const unsavedBannerRef = useRef<HTMLDivElement | null>(null);

  const canEdit =
    !!template &&
    (template.owner.id === user?.id || user?.role === "ADMIN");

  async function reload() {
    if (!token || !id) return;
    const { template: t } = await api.template(token, id);
    const designJson = (t.versions[0]?.designJson ?? {}) as Record<
      string,
      unknown
    >;
    const nextName = t.name;
    const nextVisibility = t.visibility;
    const nextCategoryId = t.category?.id ?? null;
    const nextHtml = t.versions[0]?.compiledHtml ?? "";
    const nextSubject = parseDefaultSubjectFromDesignJson(designJson);
    const nextPlaceholders = parsePlaceholdersFromDesignJson(designJson);
    const nextIgnored = parseIgnoredPlaceholdersFromDesignJson(designJson);
    const nextSlots = parseImageSlotsFromDesignJson(designJson);

    setTemplate(t);
    setName(nextName);
    setVisibility(nextVisibility);
    setCategoryId(nextCategoryId);
    setHtml(nextHtml);
    setDefaultSubject(nextSubject);
    setPlaceholders(nextPlaceholders);
    setIgnoredPlaceholders(nextIgnored);
    setImageSlots(nextSlots);
    setSavedSnap({
      name: nextName,
      defaultSubject: nextSubject,
      visibility: nextVisibility,
      categoryId: nextCategoryId,
      html: nextHtml,
      placeholders: nextPlaceholders,
      ignoredPlaceholders: nextIgnored,
      imageSlots: nextSlots,
    });
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

  /** Compiled PNG snapshot - pixel-perfect Outlook paste for Canva imports */
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

  const currentSnap = useMemo(
    (): EditSnapshot => ({
      name,
      defaultSubject,
      visibility,
      categoryId,
      html,
      placeholders,
      ignoredPlaceholders,
      imageSlots,
    }),
    [
      name,
      defaultSubject,
      visibility,
      categoryId,
      html,
      placeholders,
      ignoredPlaceholders,
      imageSlots,
    ],
  );

  const dirtyFields = useMemo(() => {
    if (!savedSnap) {
      return {
        name: false,
        defaultSubject: false,
        visibility: false,
        categoryId: false,
        placeholders: false,
        imageSlots: false,
        html: false,
      };
    }
    return {
      name: name !== savedSnap.name,
      defaultSubject: defaultSubject !== savedSnap.defaultSubject,
      visibility: visibility !== savedSnap.visibility,
      categoryId: categoryId !== savedSnap.categoryId,
      placeholders:
        JSON.stringify(placeholders) !==
          JSON.stringify(savedSnap.placeholders) ||
        JSON.stringify(ignoredPlaceholders) !==
          JSON.stringify(savedSnap.ignoredPlaceholders),
      imageSlots:
        JSON.stringify(imageSlots) !== JSON.stringify(savedSnap.imageSlots),
      html: html !== savedSnap.html,
    };
  }, [
    savedSnap,
    name,
    defaultSubject,
    visibility,
    categoryId,
    placeholders,
    ignoredPlaceholders,
    imageSlots,
    html,
  ]);

  const isDirty = Boolean(
    canEdit &&
      ((savedSnap && snapshotKey(currentSnap) !== snapshotKey(savedSnap)) ||
        pendingZipFile),
  );

  /** Highlight changed fields whenever the card has unsaved edits. */
  const markUnsaved = isDirty;

  function promptUnsaved() {
    setError(null);
    setNotice(null);
    requestAnimationFrame(() => {
      unsavedBannerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty &&
      !skipLeaveGuard.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    promptUnsaved();
    function onStayByEdit(e: Event) {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest(".unsaved-banner-actions")) return;
      blocker.reset?.();
    }
    document.addEventListener("pointerdown", onStayByEdit);
    return () => document.removeEventListener("pointerdown", onStayByEdit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);

  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  async function saveAll(): Promise<boolean> {
    if (!token || !id) {
      setError("Not signed in.");
      return false;
    }
    if (!canEdit) {
      setError("You do not have permission to edit this template.");
      return false;
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
      if (pendingZipFile) {
        await applyCanvaZip(pendingZipFile);
        setPendingZipFile(null);
        return true;
      }
      const cleanedSubject = defaultSubject.trim().slice(0, 300);
      const cleanedPlaceholders = placeholders.map((p) => ({
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
          defaultSubject: cleanedSubject,
          placeholders: cleanedPlaceholders,
          ignoredPlaceholders,
          imageSlots: cleanedSlots,
        },
        compiledHtml: html,
        previewUrl: previewImageUrl,
      });
      await reload();
      setNotice("Saved.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function applyCanvaZip(file: File) {
    if (!token || !id) return;
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
        : `Imported Canva ZIP (${imageCount} image${imageCount === 1 ? "" : "s"}). PNG snapshot failed${failDetail} - use Create preview PNG to retry.${trimNote}${phNote}`,
    );
  }

  async function onCreatePreviewPng() {
    if (!token || !id || !canEdit) return;
    const body = html.trim();
    if (!body) {
      setError("Import a Canva ZIP first, then create the preview PNG.");
      return;
    }
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await regenerateCanvaSnapshot(token, id, body, latestDesignJson);
      await reload();
      setNotice("Preview PNG created. My cards and Browse cards will use it.");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Preview PNG failed: ${err.message}`
          : "Preview PNG failed",
      );
    } finally {
      setSaving(false);
    }
  }

  function rescanAll() {
    const nextPlaceholders = syncPlaceholdersWithHtml(
      html,
      placeholders,
      ignoredPlaceholders,
    );
    const { slots, html: nextHtml } = syncImageSlotsWithHtml(html, imageSlots);
    setPlaceholders(nextPlaceholders);
    setImageSlots(slots);
    setHtml(nextHtml);
    const parts: string[] = [];
    if (nextPlaceholders.length) {
      parts.push(
        `${nextPlaceholders.length} placeholder${nextPlaceholders.length === 1 ? "" : "s"}`,
      );
    }
    if (slots.length) {
      parts.push(`${slots.length} image${slots.length === 1 ? "" : "s"}`);
    }
    setNotice(
      parts.length
        ? `Rescanned HTML - found ${parts.join(" and ")}. Review below, then Save.`
        : ignoredPlaceholders.length
          ? "Rescanned HTML - no active placeholders or images (some tags may be in Removed)."
          : "Rescanned HTML - no placeholders or content images found.",
    );
  }

  function restoreIgnoredPlaceholder(key: string) {
    const nextIgnored = ignoredPlaceholders.filter(
      (k) => k.toLowerCase() !== key.toLowerCase(),
    );
    setIgnoredPlaceholders(nextIgnored);
    const next = syncPlaceholdersWithHtml(html, placeholders, nextIgnored);
    setPlaceholders(next);
    setNotice(`Restored {{${key}}}. Review it above, then Save.`);
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
      skipLeaveGuard.current = true;
      navigate("/cards");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function discardChanges() {
    if (!savedSnap) return;
    setName(savedSnap.name);
    setDefaultSubject(savedSnap.defaultSubject);
    setVisibility(savedSnap.visibility);
    setCategoryId(savedSnap.categoryId);
    setHtml(savedSnap.html);
    setPlaceholders(savedSnap.placeholders);
    setIgnoredPlaceholders(savedSnap.ignoredPlaceholders);
    setImageSlots(savedSnap.imageSlots);
    setPendingZipFile(null);
    setError(null);
    setNotice(null);
    setPendingDeleteId(null);
  }

  const canRescan =
    canEdit &&
    Boolean(html.trim()) &&
    (latestMode === "canva_html" ||
      latestMode === "html_import" ||
      latestMode === "blank" ||
      latestMode === "designer" ||
      latestMode === "image_import");

  function renderCanvaZipControl(chooseLabel: string) {
    if (pendingZipFile) {
      return (
        <div className="import-file-added">
          <strong>ZIP added</strong>
          <span className="import-file-added-name">{pendingZipFile.name}</span>
          <button
            type="button"
            className="linkish"
            disabled={saving}
            onClick={() => setPendingZipFile(null)}
          >
            Remove
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveAll()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      );
    }
    return (
      <label className={`file-pick ${saving ? "is-disabled" : ""}`}>
        <input
          type="file"
          accept=".zip,application/zip"
          disabled={saving}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (!file) return;
            setPendingZipFile(file);
            setError(null);
            setNotice(null);
          }}
        />
        <span className="file-pick-btn">{chooseLabel}</span>
      </label>
    );
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
          emailsCrumb,
          myCardsCrumb,
          { label: template.name },
        ]}
      />
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">My cards</p>
          <h1>{template.name}</h1>
          <p className="lede">
            owned by {template.owner.displayName} · v{latest?.version ?? 1}
            {" · "}
            {modeLabel}
          </p>
        </div>
        <div className="surface-actions template-detail-actions" data-tour="design-send">
          {canEdit ? (
            <div className="template-detail-tools">
              {canRescan ? (
                <button
                  type="button"
                  className="ghost"
                  disabled={saving}
                  onClick={() => rescanAll()}
                  title="Find placeholders and images in the imported HTML"
                >
                  Rescan HTML
                </button>
              ) : null}
              <button
                type="button"
                className="ghost danger-text"
                disabled={saving}
                onClick={() => void onDeleteTemplate()}
              >
                {pendingDeleteId === "template"
                  ? "Click again to delete"
                  : "Delete card"}
              </button>
            </div>
          ) : null}
          {COMPOSE_ENABLED ? (
            isDirty ? (
              <button
                type="button"
                className="btn-link"
                onClick={() => promptUnsaved()}
              >
                Send
              </button>
            ) : (
              <Link to={`/cards/${template.id}/compose`} className="btn-link">
                Send
              </Link>
            )
          ) : (
            <span
              className="btn-link btn-link-disabled"
              title={COMPOSE_UNAVAILABLE_REASON}
              aria-disabled="true"
            >
              Send
            </span>
          )}
        </div>
      </header>

      {isDirty ? (
        <div
          className={`unsaved-banner is-sticky${
            blocker.state === "blocked" ? " is-glowing" : ""
          }`}
          role="status"
          ref={unsavedBannerRef}
        >
          <button
            type="button"
            className="unsaved-banner-copy"
            onClick={() => {
              if (blocker.state === "blocked") blocker.reset?.();
            }}
          >
            <strong>Changes not saved yet.</strong>
            <span className="muted small">
              {blocker.state === "blocked"
                ? "Save or discard to leave - or keep editing to stay."
                : "Save from here when you’re done editing."}
            </span>
          </button>
          <div className="unsaved-banner-actions">
            <button
              type="button"
              className="ghost danger-text unsaved-banner-btn"
              disabled={saving}
              onClick={() => {
                if (blocker.state === "blocked") {
                  discardChanges();
                  skipLeaveGuard.current = true;
                  blocker.proceed?.();
                  return;
                }
                discardChanges();
              }}
            >
              Discard changes
            </button>
            <button
              type="button"
              className="unsaved-banner-btn"
              disabled={saving}
              onClick={() => {
                void (async () => {
                  const ok = await saveAll();
                  if (!ok) return;
                  if (blocker.state === "blocked") {
                    skipLeaveGuard.current = true;
                    blocker.proceed?.();
                  }
                })();
              }}
            >
              {saving
                ? "Saving…"
                : blocker.state === "blocked"
                  ? "Save and leave"
                  : "Save"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <div className="panel form-stack">
        <h2 className="card-section-title">Card settings</h2>
        <label
          className={
            markUnsaved && dirtyFields.name ? "field-unsaved" : undefined
          }
        >
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit}
            maxLength={160}
          />
        </label>

        <label
          className={`field-with-hint${
            markUnsaved && dirtyFields.defaultSubject ? " field-unsaved" : ""
          }`}
        >
          Subject
          <input
            value={defaultSubject}
            onChange={(e) => setDefaultSubject(e.target.value)}
            disabled={!canEdit}
            maxLength={300}
            placeholder={FALLBACK_DEFAULT_SUBJECT}
          />
          <span className="field-hint muted small">
            Email subject when this card is sent. You can include{" "}
            <code>{"{{recipientName}}"}</code>. Leave blank to use{" "}
            <code>{FALLBACK_DEFAULT_SUBJECT}</code>.
          </span>
        </label>

        <div className="settings-pair">
          <div
            className={`field-with-hint${
              markUnsaved && dirtyFields.visibility ? " field-unsaved" : ""
            }`}
            data-tour="design-visibility"
          >
            <span className="field-label">Visibility</span>
            <select
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as "PRIVATE" | "SHARED")
              }
              disabled={!canEdit}
            >
              <option value="PRIVATE">Only me</option>
              <option value="SHARED">Shared</option>
            </select>
            <span className="field-hint muted small">
              <strong>Shared</strong> lists this card under Browse cards.{" "}
              <strong>Only me</strong> keeps it in your design studio only.
            </span>
          </div>
          {token ? (
            <div
              className={`field-with-hint${
                markUnsaved && dirtyFields.categoryId ? " field-unsaved" : ""
              }`}
            >
              <span className="field-label">Category</span>
              <CategoryCombobox
                token={token}
                value={categoryId}
                onChange={(id) => setCategoryId(id)}
                disabled={!canEdit || saving}
                allowClear={false}
                allowCreate
                label=""
              />
              <p className="field-hint muted small">
                Groups this card in Browse and My cards. Rename or delete ones
                you created via Categories.
              </p>
            </div>
          ) : null}
        </div>

        <div
          className={`surface-panel${
            markUnsaved && dirtyFields.html ? " field-unsaved" : ""
          }`}
        >
          {latestMode === "canva_html" ? (
            <>
              <p className="muted">
                Design in <strong>Canva</strong> (email size), add tags in text,
                then import the ZIP here.
              </p>
              <ol className="steps-list muted small">
                <li>
                  In Canva, design an <strong>email</strong> card.
                </li>
                <li>
                  For fill-in text, type tags like{" "}
                  <code>{"{{recipientName}}"}</code> or{" "}
                  <code>{"{{eventTitle}}"}</code> in Canva text boxes.
                </li>
                <li>
                  Download: Share → Download →{" "}
                  <strong>HTML and images</strong> (ZIP).
                </li>
                <li>Import that ZIP below. Define tags under Placeholders.</li>
              </ol>
              {canEdit ? (
                <>
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
                  {renderCanvaZipControl("Replace Canva ZIP")}
                  <button
                    type="button"
                    className="ghost"
                    disabled={saving || !html.trim()}
                    onClick={() => void onCreatePreviewPng()}
                  >
                    {saving ? "Working…" : "Create preview PNG"}
                  </button>
                </div>
                {!previewImageUrl ? (
                  <p className="muted small">
                    Grid thumbnails need this PNG. If import skipped it, press
                    Create preview PNG (no ZIP required).
                    {typeof latestDesignJson.snapshotError === "string" &&
                    latestDesignJson.snapshotError.trim()
                      ? ` Last error: ${latestDesignJson.snapshotError}`
                      : ""}
                  </p>
                ) : null}
                </>
              ) : (
                <p className="muted">View only - you don’t own this template.</p>
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
                <p className="muted">View only - you don’t own this template.</p>
              )}
            </>
          ) : (
            <>
              <p className="muted">
                {latestMode === "designer"
                  ? "This card was made in the retired freeform designer. Preview still works if HTML is saved. Replace with a Canva ZIP or create a new Canva card."
                  : "Design in Canva, add tags, then import the ZIP - or upload an image/PDF for a picture-only card."}
              </p>
              {latestMode !== "designer" ? (
                <ol className="steps-list muted small">
                  <li>
                    In Canva, design an <strong>email</strong> card.
                  </li>
                  <li>
                    Add tags in text if needed, e.g.{" "}
                    <code>{"{{recipientName}}"}</code>.
                  </li>
                  <li>
                    Download: Share → Download →{" "}
                    <strong>HTML and images</strong> (ZIP).
                  </li>
                  <li>Import the ZIP below (or upload an image/PDF instead).</li>
                </ol>
              ) : null}
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
                  {renderCanvaZipControl("Import Canva ZIP")}
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
                <p className="muted">View only - you don’t own this template.</p>
              )}
            </>
          )}
        </div>

        {!canEdit ? (
          <p className="muted">View only - you don’t own this shared template.</p>
        ) : null}
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
          showActions={false}
          className={
            markUnsaved && dirtyFields.placeholders
              ? "unsaved-section"
              : undefined
          }
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
          showActions={false}
          className={
            markUnsaved && dirtyFields.imageSlots
              ? "unsaved-section"
              : undefined
          }
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
    </div>
  );
}
