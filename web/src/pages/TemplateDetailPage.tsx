import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, assetUrl, type TemplateSummary } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  resolveHtmlImageSrcsClient,
  suggestedImgTag,
} from "../lib/htmlAssets";
import { wrapWithHeaderFooter } from "../designer/compile";
import {
  exportDesignJsonToEmailHtml,
  hasDesignerCanvas,
} from "../designer/recompile";
import { OutlookDualPreview } from "../components/OutlookDualPreview";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

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
  const [visibility, setVisibility] = useState<"PRIVATE" | "SHARED">("PRIVATE");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const [html, setHtml] = useState("");
  const [headerHtml, setHeaderHtml] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editSurface, setEditSurface] = useState<"designer" | "html">("html");
  const [surfaceReady, setSurfaceReady] = useState(false);
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
    setStatus(t.status);
    setHeaderHtml(t.headerHtml ?? "");
    setFooterHtml(t.footerHtml ?? "");
    setHtml(t.versions[0]?.compiledHtml ?? "");
    if (!surfaceReady) {
      const mode =
        typeof t.versions[0]?.designJson?.mode === "string"
          ? t.versions[0].designJson.mode
          : "blank";
      setEditSurface(mode === "designer" ? "designer" : "html");
      setSurfaceReady(true);
    }
  }

  useEffect(() => {
    if (!token || !id) return;
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  const assets = template?.assets ?? [];
  const latestMode =
    typeof template?.versions[0]?.designJson?.mode === "string"
      ? (template.versions[0].designJson.mode as string)
      : "blank";
  const latestDesignJson = (template?.versions[0]?.designJson ?? {}) as Record<
    string,
    unknown
  >;

  const previewHtml = useMemo(() => {
    const body = resolveHtmlImageSrcsClient(html, assets, API_URL);
    return resolveHtmlImageSrcsClient(
      wrapWithHeaderFooter(body, headerHtml, footerHtml),
      assets,
      API_URL,
    );
  }, [headerHtml, html, footerHtml, assets]);

  function insertImgTag(fileName: string) {
    const tag = suggestedImgTag(fileName);
    setHtml((prev) => {
      if (
        prev.includes(`src="${fileName}"`) ||
        prev.includes(`src='${fileName}'`)
      ) {
        return prev;
      }
      const spacer = prev.trim() ? "\n" : "";
      return `${prev.trimEnd()}${spacer}${tag}\n`;
    });
    setNotice(`Inserted src="${fileName}" into HTML. Click Save to keep it.`);
  }

  function openDesigner() {
    if (!template) return;
    const saved = (template.versions[0]?.compiledHtml ?? "").trim();
    const draft = html.trim();
    // Live preview uses the textarea. Prefer that HTML when editing on the HTML
    // tab or when it differs from the last save — otherwise keep the Fabric canvas.
    const preferHtml =
      editSurface === "html" ||
      latestMode !== "designer" ||
      draft !== saved;
    navigate(`/cards/${template.id}/designer`, {
      state: preferHtml && draft ? { htmlDraft: html } : undefined,
    });
  }

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
        status,
        headerHtml: headerHtml.trim() || null,
        footerHtml: footerHtml.trim() || null,
      });

      if (editSurface === "html") {
        const hadDesigner =
          latestMode === "designer" &&
          latestDesignJson &&
          typeof latestDesignJson === "object" &&
          "canvas" in latestDesignJson;

        // HTML is source of truth when saving from the HTML tab — drop the
        // Fabric canvas so Designer doesn't reopen the previous layout.
        const version = await api.saveTemplateVersion(token, id, {
          designJson: {
            mode: html.trim() ? "html_import" : "blank",
            sourceHtml: html,
          },
          compiledHtml: html,
          previewUrl: null,
        });
        await reload();
        setNotice(
          hadDesigner
            ? `Saved HTML (v${version.version}). Designer canvas was cleared — reopen Designer to import shapes back from this HTML (best-effort).`
            : `Saved HTML (v${version.version}).`,
        );
      } else {
        await reload();
        setNotice(
          "Saved settings. Open Designer → Save & compile to update the card layout.",
        );
      }
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
    const mode =
      typeof designJson.mode === "string" ? designJson.mode : "blank";
    const designUses = countDesignUses(designJson, storageKey, fileName);
    const inHtml = htmlUsesAsset(html, fileName, storageKey);
    const hasCompiledPreview =
      mode === "designer" && Boolean((template.versions[0]?.compiledHtml ?? "").trim());

    setAssetDeletePrompt({
      id: assetId,
      fileName,
      storageKey,
      designUses,
      inHtml,
      clearsPreview: designUses > 0 || (hasCompiledPreview && designUses > 0),
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
            mode: mode === "designer" ? "designer" : nextDesign.mode ?? mode,
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
          ? `Removed “${fileName}” from the card (${designUses} placement${designUses === 1 ? "" : "s"}) and cleared the email preview. Use Recompile preview to rebuild it.`
          : inHtml
            ? `Removed “${fileName}” from uploads and HTML.`
            : `Deleted image “${fileName}”.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete image failed");
    }
  }

  async function clearStalePreview() {
    if (!token || !id || !canEdit || !template) return;
    setError(null);
    try {
      const designJson = (template.versions[0]?.designJson ?? {}) as Record<
        string,
        unknown
      >;
      await api.purgeCompiledAssets(token, id);
      await api.saveTemplateVersion(token, id, {
        designJson,
        compiledHtml: "",
        previewUrl: null,
      });
      setHtml("");
      await reload();
      setNotice(
        hasDesignerCanvas(designJson)
          ? "Cleared email preview. Use Recompile preview to rebuild from the saved canvas."
          : "Cleared email preview.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear preview");
    }
  }

  async function recompilePreview() {
    if (!token || !id || !canEdit || !template) return;
    if (!hasDesignerCanvas(latestDesignJson)) {
      setError("No saved designer canvas to recompile. Open Designer first.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const design = latestDesignJson as {
        canvas: Record<string, unknown>;
        width?: number;
        height?: number;
        frame?: {
          radius: number;
          borderWidth: number;
          borderColor: string;
        };
      };
      const compiledHtml = await exportDesignJsonToEmailHtml(
        design,
        template.name,
      );
      try {
        await api.purgeCompiledAssets(token, id);
      } catch {
        // optional cleanup
      }
      await api.saveTemplateVersion(token, id, {
        designJson: latestDesignJson,
        compiledHtml,
        previewUrl: null,
      });
      setHtml(compiledHtml);
      await reload();
      setNotice("Recompiled email preview from the saved designer canvas.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Recompile failed",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onUpload(file: File | null) {
    if (!token || !id || !file || !canEdit) return;
    setError(null);
    setNotice(null);
    try {
      const { asset } = await api.uploadTemplateAsset(token, id, file);
      await reload();
      const tag = asset.suggestedHtml || suggestedImgTag(asset.fileName);
      setHtml((prev) => {
        if (
          prev.includes(`src="${asset.fileName}"`) ||
          prev.includes(`src='${asset.fileName}'`)
        ) {
          return prev;
        }
        const spacer = prev.trim() ? "\n" : "";
        return `${prev.trimEnd()}${spacer}${tag}\n`;
      });
      setNotice(
        `Uploaded ${asset.fileName}. Click Save to store the HTML change.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
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
      <p className="back">
        <Link to="/cards">← Templates</Link>
      </p>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Template</p>
          <h1>{template.name}</h1>
          <p className="lede">
            owned by {template.owner.displayName} · v{latest?.version ?? 1}
            {latestMode === "designer" ? " · has designer layout" : ""}
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <div className="panel form-stack">
        <div className="tools-tags edit-surface-tags" role="tablist" aria-label="Edit surface">
          <button
            type="button"
            role="tab"
            className={`tools-tag ${editSurface === "designer" ? "active" : ""}`}
            aria-selected={editSurface === "designer"}
            onClick={() => setEditSurface("designer")}
          >
            Designer
          </button>
          <button
            type="button"
            role="tab"
            className={`tools-tag ${editSurface === "html" ? "active" : ""}`}
            aria-selected={editSurface === "html"}
            onClick={() => {
              setEditSurface("html");
              setHtml(template.versions[0]?.compiledHtml ?? "");
            }}
          >
            HTML
          </button>
        </div>

        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit}
            maxLength={160}
          />
        </label>

        <div className="two-col">
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
              <option value="SHARED">Shared</option>
            </select>
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "DRAFT" | "PUBLISHED")
              }
              disabled={!canEdit}
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </label>
        </div>

        {editSurface === "designer" ? (
          <div className="surface-panel">
            <p className="muted">
              Edit shapes, text, and images on the canvas.{" "}
              <strong>Save &amp; compile</strong> exports the full card as HTML
              (text, shapes, and images as real markup) and updates the HTML tab.
            </p>
            {canEdit ? (
              <div className="surface-actions">
                <button type="button" onClick={openDesigner}>
                  Open designer
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setEditSurface("html");
                    setHtml(template.versions[0]?.compiledHtml ?? "");
                  }}
                >
                  View compiled HTML
                </button>
              </div>
            ) : (
              <p className="muted">View only — you don’t own this template.</p>
            )}
          </div>
        ) : (
          <div className="html-surface">
            {latestMode === "designer" ? (
              <div className="compiled-html-note">
                <p>
                  This HTML was exported from the designer. Editing here updates
                  the live preview immediately. Opening Designer imports your
                  current HTML (save on the card page to store it; Save &amp;
                  compile in Designer to store a canvas layout).
                </p>
                <p className="muted small">
                  Round-trip works best for designer-exported markup. Complex
                  hand-written HTML may only partially import.
                </p>
                {canEdit ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={openDesigner}
                  >
                    Edit in designer
                  </button>
                ) : null}
              </div>
            ) : null}
            <label>
              Email HTML
              <span className="field-hint">
                This is what gets wrapped with header/footer for the preview and
                drafts. Use <code>src=&quot;filename.jpg&quot;</code> for
                uploaded images when writing HTML by hand.
              </span>
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={14}
                disabled={!canEdit || saving}
                spellCheck={false}
                className="html-code"
              />
            </label>
            <div className="surface-actions">
              <button
                type="button"
                className="ghost"
                disabled={!html.trim()}
                onClick={() => {
                  void navigator.clipboard.writeText(html);
                  setNotice("HTML copied to clipboard.");
                }}
              >
                Copy HTML
              </button>
            </div>
          </div>
        )}

        <label>
          Header HTML <span className="optional-tag">(optional)</span>
          <textarea
            value={headerHtml}
            onChange={(e) => setHeaderHtml(e.target.value)}
            rows={3}
            disabled={!canEdit || saving}
            placeholder="Optional company banner"
          />
        </label>
        <label>
          Footer HTML <span className="optional-tag">(optional)</span>
          <textarea
            value={footerHtml}
            onChange={(e) => setFooterHtml(e.target.value)}
            rows={3}
            disabled={!canEdit || saving}
            placeholder="Optional disclaimer"
          />
        </label>

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

      <section className="panel">
        <h2>Images</h2>
        <p className="muted">Max 2MB · JPEG/PNG/GIF/WebP</p>
        {canEdit ? (
          <label className={`file-pick ${saving ? "is-disabled" : ""}`}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              disabled={saving}
              onChange={(e) => {
                void onUpload(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <span className="file-pick-btn">Choose image</span>
            <span className="file-pick-name muted">JPEG, PNG, GIF, or WebP</span>
          </label>
        ) : null}
        {latestMode === "designer" ? (
          <p className="muted small tip" style={{ marginTop: "0.75rem" }}>
            If an image is on the designer card, deleting it asks for confirmation
            and clears the compiled preview until you recompile (or Save &amp;
            compile in Designer).
          </p>
        ) : null}
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
                  {editSurface === "html" ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => insertImgTag(a.fileName)}
                    >
                      Insert into HTML
                    </button>
                  ) : null}
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
          <p className="muted">No images uploaded yet.</p>
        ) : null}
        {canEdit && hasDesignerCanvas(latestDesignJson) ? (
          <div className="stale-preview-actions">
            {assets.length === 0 && html.trim() ? (
              <p className="muted small">
                A compiled preview is still stored, but there are no source images
                in this list.
              </p>
            ) : !html.trim() ? (
              <p className="muted small">
                Preview is empty. Recompile from the saved designer canvas, or
                open Designer to edit.
              </p>
            ) : (
              <p className="muted small">
                Rebuild the email preview from the last saved designer layout
                without opening the canvas.
              </p>
            )}
            <div className="surface-actions">
              <button
                type="button"
                className="ghost"
                disabled={saving}
                onClick={() => void recompilePreview()}
              >
                {saving ? "Recompiling…" : "Recompile preview"}
              </button>
              {assets.length === 0 && html.trim() ? (
                <button
                  type="button"
                  className="ghost danger-text"
                  disabled={saving}
                  onClick={() => void clearStalePreview()}
                >
                  Clear outdated preview
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {previewHtml.trim() ? <OutlookDualPreview html={previewHtml} /> : null}

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
                    ? ` (${assetDeletePrompt.designUses} designer placement${assetDeletePrompt.designUses === 1 ? "" : "s"})`
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
