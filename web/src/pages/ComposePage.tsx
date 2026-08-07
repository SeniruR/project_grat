import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type DirectoryPerson,
  type TemplateSummary,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { wrapWithHeaderFooter } from "../lib/emailHtml";
import { resolveHtmlImageSrcsClient } from "../lib/htmlAssets";
import {
  applyMergeFields,
  buildMergeFieldMapFromPlaceholders,
  detectMergeFields,
  humanizePlaceholderKey,
  isRecipientNameToken,
  DEFAULT_NAME_HONORIFICS,
  parsePlaceholdersFromDesignJson,
  perRecipientPlaceholderKeys,
  PLACEHOLDER_SOURCES,
  placeholderSourceLabel,
  resolveTemplateDefaultSubject,
  sharedPlaceholderKeys,
  suggestPlaceholderSource,
  withHonorific,
  type NameHonorific,
  type PlaceholderDef,
  type PlaceholderSource,
} from "../lib/mergeFields";
import {
  applyImageSlotOverrides,
  imageSlotModeLabel,
  normalizeImageSlotRadiiInHtml,
  parseImageSlotsFromDesignJson,
  perRecipientImageSlots,
  resizeImageFileToSlot,
  resolveSlotBorderRadius,
  sharedImageSlots,
  type ImageSlotDef,
} from "../lib/imageSlots";
import { OutlookDualPreview } from "../components/OutlookDualPreview";
import { ToastBanner } from "../components/ToastBanner";
import { Breadcrumbs, emailsCrumb } from "../components/Breadcrumbs";
import { canManageDesigns, canUseAdvancedCompose } from "../lib/roles";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COMPOSE_PLACEHOLDER_SOURCES = PLACEHOLDER_SOURCES.filter(
  (s) => s.value !== "shared" && s.value !== "perRecipient",
);

function parseTypedEmail(raw: string): DirectoryPerson | null {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  const local = email.split("@")[0] ?? email;
  const displayName =
    local
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim() || email;
  return { aadOid: `manual-${email}`, email, displayName };
}

function personKey(p: DirectoryPerson) {
  return p.email.trim().toLowerCase();
}

function composePlaceholderSource(
  source: PlaceholderSource,
  advanced: boolean,
): PlaceholderSource {
  if (advanced) return source;
  if (source === "shared" || source === "perRecipient") {
    return "recipientName";
  }
  return source;
}

export function ComposePage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<TemplateSummary | null>(null);
  const [subject, setSubject] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [sharedFields, setSharedFields] = useState<Record<string, string>>({});
  const [perRecipientFields, setPerRecipientFields] = useState<
    Record<string, Record<string, string>>
  >({});
  /** Subject-only tokens not already defined on the template. */
  const [subjectExtras, setSubjectExtras] = useState<PlaceholderDef[]>([]);
  const [sharedImageUrls, setSharedImageUrls] = useState<
    Record<string, string>
  >({});
  const [perRecipientImageUrls, setPerRecipientImageUrls] = useState<
    Record<string, Record<string, string>>
  >({});
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  /** Resolved corner radii for slots (CSS or inferred from original PNG). */
  const [slotRadii, setSlotRadii] = useState<Record<string, number>>({});
  const [previewPersonEmail, setPreviewPersonEmail] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DirectoryPerson[]>([]);
  const [selected, setSelected] = useState<DirectoryPerson[]>([]);
  /** Tick → show Mr/Mrs/Miss for that recipient (when name placeholders are used). */
  const [recipientTitleEnabled, setRecipientTitleEnabled] = useState<
    Record<string, boolean>
  >({});
  const [recipientTitles, setRecipientTitles] = useState<
    Record<string, string>
  >({});
  const [senderTitleEnabled, setSenderTitleEnabled] = useState(false);
  const [senderTitle, setSenderTitle] = useState("Mr.");
  const [nameHonorifics, setNameHonorifics] = useState<NameHonorific[]>([
    ...DEFAULT_NAME_HONORIFICS,
  ]);
  const [error, setError] = useState<string | null>(null);
  const [errorTick, setErrorTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mailMode, setMailMode] = useState("mock");
  const [smtpFrom, setSmtpFrom] = useState<string | null>(null);
  const [smtpFromName, setSmtpFromName] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const dismissError = useCallback(() => setError(null), []);

  function reportError(message: string) {
    setError(message);
    setErrorTick((n) => n + 1);
  }

  useEffect(() => {
    api
      .getMode()
      .then((m) => {
        setMailMode(m.mailMode);
        setSmtpFrom(m.smtpFrom ?? null);
        setSmtpFromName(m.smtpFromName ?? null);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!token) return;
    api
      .nameHonorifics(token)
      .then((res) => {
        if (res.honorifics?.length) {
          setNameHonorifics(res.honorifics);
          setSenderTitle((prev) => {
            if (res.honorifics.some((h) => h.value === prev)) return prev;
            return res.honorifics[0]?.value ?? prev;
          });
        }
      })
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!token || !id) return;
    api
      .template(token, id)
      .then(({ template: t }) => {
        setTemplate(t);
        setSubject((prev) =>
          prev ||
          resolveTemplateDefaultSubject(
            (t.versions[0]?.designJson ?? {}) as Record<string, unknown>,
          ),
        );
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load template"),
      );
  }, [token, id]);

  useEffect(() => {
    if (!user) return;
    setSenderName((prev) => prev || user.displayName || "");
    setSenderEmail((prev) => prev || user.email || "");
  }, [user]);

  useEffect(() => {
    if (mailMode !== "smtp") return;
    if (smtpFromName) setSenderName(smtpFromName);
    if (smtpFrom) setSenderEmail(smtpFrom);
  }, [mailMode, smtpFrom, smtpFromName]);

  useEffect(() => {
    if (!token) return;
    const q = query.trim();
    if (q.length < 1 || EMAIL_RE.test(q)) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setSearching(true);
      api
        .directorySearch(token, q)
        .then((res) => setHits(res.people))
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 220);
    return () => window.clearTimeout(handle);
  }, [token, query]);

  const compiled = (template?.versions[0]?.compiledHtml ?? "").trim();
  const assets = template?.assets ?? [];

  const templatePlaceholders: PlaceholderDef[] = useMemo(
    () =>
      parsePlaceholdersFromDesignJson(
        (template?.versions[0]?.designJson ?? {}) as Record<string, unknown>,
      ),
    [template],
  );

  // Keep subject-only defs in sync with {{tokens}} typed in the subject.
  useEffect(() => {
    const advanced = canUseAdvancedCompose(user);
    const keys = detectMergeFields(subject);
    const templateKeys = new Set(
      templatePlaceholders.map((p) => p.key.toLowerCase()),
    );
    const unknown = keys.filter((k) => !templateKeys.has(k.toLowerCase()));
    setSubjectExtras((prev) => {
      const prevBy = new Map(
        prev.map((p) => [p.key.toLowerCase(), p] as const),
      );
      return unknown.map((key) => {
        const existing = prevBy.get(key.toLowerCase());
        if (existing) {
          return {
            ...existing,
            key,
            source: composePlaceholderSource(existing.source, advanced),
          };
        }
        return {
          key,
          label: humanizePlaceholderKey(key),
          source: composePlaceholderSource(
            suggestPlaceholderSource(key),
            advanced,
          ),
        };
      });
    });
  }, [subject, templatePlaceholders, user]);

  const placeholders: PlaceholderDef[] = useMemo(() => {
    const seen = new Set(templatePlaceholders.map((p) => p.key.toLowerCase()));
    const extras = subjectExtras.filter((p) => !seen.has(p.key.toLowerCase()));
    return [...templatePlaceholders, ...extras];
  }, [templatePlaceholders, subjectExtras]);

  const imageSlots: ImageSlotDef[] = useMemo(
    () =>
      parseImageSlotsFromDesignJson(
        (template?.versions[0]?.designJson ?? {}) as Record<string, unknown>,
      ),
    [template],
  );

  const sharedKeys = useMemo(
    () => sharedPlaceholderKeys(placeholders),
    [placeholders],
  );
  const perPersonKeys = useMemo(
    () => perRecipientPlaceholderKeys(placeholders),
    [placeholders],
  );
  const sharedSlots = useMemo(
    () => sharedImageSlots(imageSlots),
    [imageSlots],
  );
  const perPersonSlots = useMemo(
    () => perRecipientImageSlots(imageSlots),
    [imageSlots],
  );

  const slotsForOverrides = useMemo(
    () =>
      imageSlots.map((s) => ({
        ...s,
        borderRadius: slotRadii[s.id] ?? s.borderRadius ?? 0,
      })),
    [imageSlots, slotRadii],
  );

  const previewPerson =
    selected.find((p) => personKey(p) === previewPersonEmail) ??
    selected[0] ??
    null;

  useEffect(() => {
    if (!selected.length) {
      setPreviewPersonEmail("");
      return;
    }
    if (
      !previewPersonEmail ||
      !selected.some((p) => personKey(p) === previewPersonEmail)
    ) {
      setPreviewPersonEmail(personKey(selected[0]));
    }
  }, [selected, previewPersonEmail]);

  const sampleCtx = useMemo(
    () => {
      const previewKey = previewPerson ? personKey(previewPerson) : "";
      const titledRecipient = withHonorific(
        previewKey && recipientTitleEnabled[previewKey]
          ? recipientTitles[previewKey] || nameHonorifics[0]?.value || "Mr."
          : "",
        previewPerson?.displayName ?? "Alex",
      );
      const titledSender = withHonorific(
        senderTitleEnabled ? senderTitle : "",
        senderName.trim() || user?.displayName || "You",
      );
      return {
        recipientName: titledRecipient,
        recipientEmail: previewPerson?.email ?? "alex@example.com",
        senderName: titledSender,
        senderEmail: senderEmail.trim() || user?.email || "you@example.com",
        shared: sharedFields,
        perRecipient: previewPerson
          ? (perRecipientFields[personKey(previewPerson)] ?? {})
          : {},
      };
    },
    [
      previewPerson,
      senderName,
      senderEmail,
      sharedFields,
      perRecipientFields,
      user,
      recipientTitleEnabled,
      recipientTitles,
      senderTitleEnabled,
      senderTitle,
      nameHonorifics,
    ],
  );

  const previewSubject = useMemo(() => {
    const raw = subject.trim();
    if (!raw) return "";
    return applyMergeFields(
      raw,
      buildMergeFieldMapFromPlaceholders(placeholders, sampleCtx),
    );
  }, [subject, placeholders, sampleCtx]);

  const previewHtml = useMemo(() => {
    if (!template || !compiled) return "";
    let body = resolveHtmlImageSrcsClient(compiled, assets, API_URL);
    body = wrapWithHeaderFooter(
      body,
      template.headerHtml,
      template.footerHtml,
    );
    body = applyMergeFields(
      body,
      buildMergeFieldMapFromPlaceholders(placeholders, sampleCtx),
    );
    body = normalizeImageSlotRadiiInHtml(body, slotsForOverrides);
    const previewOverrides: Record<string, string> = { ...sharedImageUrls };
    if (previewPerson) {
      Object.assign(
        previewOverrides,
        perRecipientImageUrls[personKey(previewPerson)] ?? {},
      );
    }
    body = applyImageSlotOverrides(body, previewOverrides, slotsForOverrides);
    return resolveHtmlImageSrcsClient(body, assets, API_URL);
  }, [
    template,
    compiled,
    assets,
    placeholders,
    sampleCtx,
    sharedImageUrls,
    perRecipientImageUrls,
    previewPerson,
    slotsForOverrides,
  ]);

  function addPerson(person: DirectoryPerson) {
    setSelected((prev) => {
      if (prev.some((p) => personKey(p) === personKey(person))) return prev;
      return [...prev, person];
    });
    setQuery("");
    setHits([]);
  }

  function tryAddTypedEmail() {
    const person = parseTypedEmail(query);
    if (!person) {
      reportError("Enter a valid email address (e.g. you@example.com).");
      return;
    }
    setError(null);
    addPerson(person);
  }

  const typedRecipient = parseTypedEmail(query);
  const showTypedAdd =
    typedRecipient &&
    !selected.some((s) => personKey(s) === personKey(typedRecipient));

  function removePerson(email: string) {
    const key = email.trim().toLowerCase();
    setSelected((prev) => prev.filter((p) => personKey(p) !== key));
    setPerRecipientFields((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setPerRecipientImageUrls((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setRecipientTitleEnabled((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setRecipientTitles((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function titledRecipientName(person: DirectoryPerson): string {
    const ek = personKey(person);
    return withHonorific(
      recipientTitleEnabled[ek]
        ? recipientTitles[ek] || nameHonorifics[0]?.value || "Mr."
        : "",
      person.displayName,
    );
  }

  function titledSenderName(): string {
    return withHonorific(
      senderTitleEnabled ? senderTitle : "",
      senderName.trim() || user?.displayName || "",
    );
  }

  function toggleSubjectTag(key: string) {
    const token = `{{${key}}}`;
    setSubject((prev) => {
      if (prev.includes(token)) {
        return prev
          .split(token)
          .join("")
          .replace(/\s{2,}/g, " ")
          .trim();
      }
      const base = prev.trim();
      return base ? `${base} ${token}` : token;
    });
  }

  function setShared(key: string, value: string) {
    setSharedFields((prev) => ({ ...prev, [key]: value }));
  }

  function setPerPerson(email: string, key: string, value: string) {
    const ek = email.trim().toLowerCase();
    setPerRecipientFields((prev) => ({
      ...prev,
      [ek]: { ...(prev[ek] ?? {}), [key]: value },
    }));
  }

  function updateSubjectExtra(
    key: string,
    patch: Partial<Pick<PlaceholderDef, "label" | "source">>,
  ) {
    setSubjectExtras((prev) =>
      prev.map((row) =>
        row.key.toLowerCase() === key.toLowerCase()
          ? { ...row, ...patch }
          : row,
      ),
    );
  }

  async function uploadSlotImage(
    slot: ImageSlotDef,
    file: File,
    scope: "shared" | { recipientEmail: string },
  ) {
    if (!token || !template || !canUseAdvancedCompose(user)) return;
    const uploadKey =
      scope === "shared"
        ? `shared:${slot.id}`
        : `person:${scope.recipientEmail}:${slot.id}`;
    setUploadingSlot(uploadKey);
    setError(null);
    try {
      const borderRadius = await resolveSlotBorderRadius(slot);
      if (borderRadius > 0) {
        setSlotRadii((prev) => ({ ...prev, [slot.id]: borderRadius }));
      }
      // Unique name per scope so recipient A’s upload isn’t deleted when
      // uploading the same slot for recipient B (or shared vs per-person).
      const scopeTag =
        scope === "shared"
          ? "shared"
          : `r-${scope.recipientEmail
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 48)}`;
      const resized = await resizeImageFileToSlot(
        file,
        slot.designedWidth,
        slot.designedHeight,
        {
          fileName: `${slot.id}-override-${scopeTag}`,
          borderRadius,
        },
      );
      const { asset } = await api.uploadTemplateAsset(
        token,
        template.id,
        resized,
        "override",
      );
      if (scope === "shared") {
        setSharedImageUrls((prev) => ({ ...prev, [slot.id]: asset.url }));
      } else {
        const ek = scope.recipientEmail.trim().toLowerCase();
        setPerRecipientImageUrls((prev) => ({
          ...prev,
          [ek]: { ...(prev[ek] ?? {}), [slot.id]: asset.url },
        }));
      }
    } catch (err) {
      reportError(
        err instanceof Error ? err.message : "Could not upload replacement image",
      );
    } finally {
      setUploadingSlot(null);
    }
  }

  function clearSlotImage(
    slotId: string,
    scope: "shared" | { recipientEmail: string },
  ) {
    if (scope === "shared") {
      setSharedImageUrls((prev) => {
        const next = { ...prev };
        delete next[slotId];
        return next;
      });
      return;
    }
    const ek = scope.recipientEmail.trim().toLowerCase();
    setPerRecipientImageUrls((prev) => {
      const row = { ...(prev[ek] ?? {}) };
      delete row[slotId];
      const next = { ...prev };
      if (Object.keys(row).length) next[ek] = row;
      else delete next[ek];
      return next;
    });
  }

  function validateMergeInputs(): string | null {
    if (!canUseAdvancedCompose(user)) return null;
    for (const key of sharedKeys) {
      if (!(sharedFields[key] ?? "").trim()) {
        const label =
          placeholders.find((p) => p.key === key)?.label ?? key;
        return `Fill shared field {{${key}}} (${label}).`;
      }
    }
    for (const person of selected) {
      const ek = personKey(person);
      for (const key of perPersonKeys) {
        if (!(perRecipientFields[ek]?.[key] ?? "").trim()) {
          const label =
            placeholders.find((p) => p.key === key)?.label ?? key;
          return `Fill {{${key}}} (${label}) for ${person.displayName}.`;
        }
      }
    }
    return null;
  }

  async function createDrafts() {
    if (!token || !template || !id) return;
    if (!compiled) {
      reportError(
        "No compiled email HTML yet. Import a Canva ZIP (or HTML) on the card page first.",
      );
      return;
    }
    if (!subject.trim()) {
      reportError("Subject is required.");
      return;
    }
    if (!selected.length) {
      reportError("Pick at least one recipient.");
      return;
    }
    if (!senderName.trim() && mailMode !== "smtp") {
      reportError("Sender name is required.");
      return;
    }
    if (mailMode !== "smtp" && !EMAIL_RE.test(senderEmail.trim())) {
      reportError("Enter a valid sender email.");
      return;
    }
    const mergeErr = validateMergeInputs();
    if (mergeErr) {
      reportError(mergeErr);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const trimmedShared: Record<string, string> = {};
      if (canUseAdvancedCompose(user)) {
        for (const key of sharedKeys) {
          trimmedShared[key] = (sharedFields[key] ?? "").trim();
        }
      }

      const sharedImages: Record<string, string> = {};
      if (canUseAdvancedCompose(user)) {
        for (const slot of sharedSlots) {
          const url = (sharedImageUrls[slot.id] ?? "").trim();
          if (url) sharedImages[slot.id] = url;
        }
      }

      const extrasForSubmit = subjectExtras
        .filter(
          (p) =>
            canUseAdvancedCompose(user) ||
            (p.source !== "shared" && p.source !== "perRecipient"),
        )
        .map((p) => ({
          key: p.key,
          label: p.label.trim() || p.key,
          source: p.source,
        }));

      const { job } = await api.createDraftJob(token, {
        templateId: template.id,
        templateVersionId: template.versions[0]?.id,
        subject: subject.trim(),
        senderName:
          titledSenderName().trim() ||
          (mailMode === "smtp" ? "Gratitude cards" : senderName.trim()),
        senderEmail:
          mailMode === "smtp"
            ? (smtpFrom || senderEmail).trim().toLowerCase()
            : senderEmail.trim().toLowerCase(),
        ...(Object.keys(trimmedShared).length
          ? { sharedFields: trimmedShared }
          : {}),
        ...(Object.keys(sharedImages).length
          ? { sharedImageSlots: sharedImages }
          : {}),
        ...(extrasForSubmit.length ? { extraPlaceholders: extrasForSubmit } : {}),
        recipients: selected.map((p) => {
          const ek = personKey(p);
          const fields: Record<string, string> = {};
          const imageSlotUrls: Record<string, string> = {};
          if (canUseAdvancedCompose(user)) {
            for (const key of perPersonKeys) {
              fields[key] = (perRecipientFields[ek]?.[key] ?? "").trim();
            }
            for (const slot of perPersonSlots) {
              const url = (perRecipientImageUrls[ek]?.[slot.id] ?? "").trim();
              if (url) imageSlotUrls[slot.id] = url;
            }
          }
          return {
            aadOid: p.aadOid,
            email: p.email,
            displayName: titledRecipientName(p),
            ...(Object.keys(fields).length ? { fields } : {}),
            ...(Object.keys(imageSlotUrls).length
              ? { imageSlots: imageSlotUrls }
              : {}),
          };
        }),
      });
      navigate(`/drafts/${job.id}`);
    } catch (err) {
      reportError(err instanceof Error ? err.message : "Could not create drafts");
    } finally {
      setBusy(false);
    }
  }

  const advancedCompose = canUseAdvancedCompose(user);
  const composePlaceholderSources = advancedCompose
    ? PLACEHOLDER_SOURCES
    : COMPOSE_PLACEHOLDER_SOURCES;

  const usesRecipientName = useMemo(() => {
    if (placeholders.some((p) => p.source === "recipientName")) return true;
    return detectMergeFields(subject).some((k) => isRecipientNameToken(k));
  }, [placeholders, subject]);

  const usesSenderName = useMemo(() => {
    if (placeholders.some((p) => p.source === "senderName")) return true;
    return detectMergeFields(subject).some((k) => {
      const n = k.toLowerCase().replace(/[_.-]/g, "");
      return n === "sendername" || n === "fromname" || n === "sender";
    });
  }, [placeholders, subject]);

  const subjectTagOptions = useMemo(() => {
    const byKey = new Map<string, PlaceholderDef>();
    for (const ph of placeholders) {
      if (ph.source === "shared" || ph.source === "perRecipient") continue;
      byKey.set(ph.key.toLowerCase(), ph);
    }
    const ensure = (
      key: string,
      label: string,
      source: PlaceholderSource,
    ) => {
      if (!byKey.has(key.toLowerCase())) {
        byKey.set(key.toLowerCase(), { key, label, source });
      }
    };
    ensure("recipientName", "Recipient name", "recipientName");
    ensure("senderName", "Sender name", "senderName");
    ensure("recipientEmail", "Recipient email", "recipientEmail");
    ensure("senderEmail", "Sender email", "senderEmail");
    return [...byKey.values()];
  }, [placeholders]);

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
        <Link to="/marketplace">Back to Templates</Link>
      </div>
    );
  }

  const fromDesigns =
    canManageDesigns(user) && template.owner.id === user?.id;
  const hasAdvancedPlaceholders =
    sharedKeys.length > 0 || perPersonKeys.length > 0;
  const hasReplaceableImages =
    sharedSlots.length > 0 || perPersonSlots.length > 0;
  const parentCrumb = fromDesigns
    ? { label: "My Designs", to: "/cards" }
    : { label: "Templates", to: "/marketplace" };
  const parentDetailTo = fromDesigns
    ? `/cards/${template.id}`
    : `/marketplace/${template.id}`;

  return (
    <div className="page">
      <ToastBanner
        key={errorTick}
        message={error}
        onClose={dismissError}
      />
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          emailsCrumb,
          parentCrumb,
          { label: template.name, to: parentDetailTo },
          { label: "Compose" },
        ]}
      />
      <header className="page-header">
        <div>
          <p className="eyebrow">Emails</p>
          <h1>
            {mailMode === "smtp" ? "Send email" : "Create Outlook drafts"}
          </h1>
          <p className="lede">
            {advancedCompose ? (
              <>
                Fill placeholders and optional image replacements the template
                owner defined. Auto fields use recipients and sender; shared and
                per-person values apply to this send only. The saved template is
                not changed.
              </>
            ) : (
              <>
                Fill automatic placeholders from recipients and sender details.
                Shared and per-person fields, and image changes, are only
                available to designers and admins — your send uses the template
                as designed.
              </>
            )}
          </p>
        </div>
      </header>

      {!compiled ? (
        <p className="notice">
          This card has no compiled HTML yet.{" "}
          <Link to={`/cards/${template.id}`}>Open the card</Link> and import a
          Canva ZIP (or HTML).
        </p>
      ) : null}

      <div className="compose-layout">
        <section className="panel form-stack">
          <label>
            Subject
            <input
              value={subject}
              onChange={(e) => {
                if (!advancedCompose) return;
                setSubject(e.target.value);
              }}
              readOnly={!advancedCompose}
              disabled={busy}
              maxLength={300}
              placeholder={
                resolveTemplateDefaultSubject(
                  (template.versions[0]?.designJson ?? {}) as Record<
                    string,
                    unknown
                  >,
                )
              }
              aria-describedby="compose-subject-hint"
            />
          </label>
          <p id="compose-subject-hint" className="muted small compose-subject-hint">
            {advancedCompose ? (
              <>
                Use card placeholders (e.g. <code>{"{{recipientName}}"}</code>
                {templatePlaceholders.length > 0 ? (
                  <>
                    {" "}
                    or <code>{`{{${templatePlaceholders[0].key}}}`}</code>
                  </>
                ) : null}
                ), or type a new <code>{"{{token}}"}</code> — define how it’s
                filled below. Each recipient gets their own merged subject.
              </>
            ) : (
              <>
                Subject text is locked for your account. Use the tags below to
                insert placeholders only — free typing is unavailable. Each
                recipient gets their own merged subject.
              </>
            )}
          </p>
          {!advancedCompose ? (
            <div className="compose-subject-tags" role="group" aria-label="Subject tags">
              {subjectTagOptions.map((tag) => {
                const token = `{{${tag.key}}}`;
                const active = subject.includes(token);
                return (
                  <button
                    key={tag.key}
                    type="button"
                    className={`compose-subject-tag ${active ? "is-active" : ""}`}
                    disabled={busy}
                    onClick={() => toggleSubjectTag(tag.key)}
                    title={
                      active
                        ? `Remove ${token} from subject`
                        : `Insert ${token} into subject`
                    }
                  >
                    {token}
                  </button>
                );
              })}
            </div>
          ) : null}
          {previewSubject && previewSubject !== subject.trim() ? (
            <p className="compose-subject-preview muted small">
              Preview: <strong>{previewSubject}</strong>
            </p>
          ) : null}

          {advancedCompose && subjectExtras.length > 0 ? (
            <div className="compose-subject-extras">
              <h4 className="merge-input-title">New subject placeholders</h4>
              <p className="muted small">
                These tokens are only in the subject (not on the card). Choose
                {advancedCompose ? (
                  <>
                    {" "}
                    shared vs per-person (or auto fields) — Compose will ask for
                    values the same way as card placeholders.
                  </>
                ) : (
                  <>
                    {" "}
                    how each token is filled from recipient or sender details.
                    Shared and per-person subject placeholders are unavailable
                    for your account.
                  </>
                )}
              </p>
              <div className="merge-guide-table-wrap">
                <table className="merge-guide-table placeholder-config-table">
                  <thead>
                    <tr>
                      <th>Placeholder</th>
                      <th>Meaning</th>
                      <th>Filled how</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectExtras.map((ph) => (
                      <tr key={ph.key.toLowerCase()}>
                        <td>
                          <code>{`{{${ph.key}}}`}</code>
                        </td>
                        <td>
                          <input
                            value={ph.label}
                            onChange={(e) =>
                              updateSubjectExtra(ph.key, {
                                label: e.target.value,
                              })
                            }
                            disabled={busy}
                            maxLength={120}
                            aria-label={`Label for ${ph.key}`}
                          />
                        </td>
                        <td>
                          <select
                            value={ph.source}
                            onChange={(e) =>
                              updateSubjectExtra(ph.key, {
                                source: e.target.value as PlaceholderSource,
                              })
                            }
                            disabled={busy}
                            aria-label={`Source for ${ph.key}`}
                          >
                            {composePlaceholderSources.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                          <span className="muted small merge-alias">
                            {
                              composePlaceholderSources.find(
                                (s) => s.value === ph.source,
                              )?.hint
                            }
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <fieldset className="choice-set compose-sender">
            <legend>From</legend>
            {mailMode === "smtp" ? (
              <p className="muted small compose-smtp-from">
                Mail is always sent via your SMTP account as{" "}
                <strong>{smtpFromName || "Gratitude cards"}</strong>
                {smtpFrom ? (
                  <>
                    {" "}
                    &lt;<code>{smtpFrom}</code>&gt;
                  </>
                ) : null}
                . Card placeholders like <code>{"{{senderName}}"}</code> /{" "}
                <code>{"{{senderEmail}}"}</code> use that identity. Gmail’s
                inbox list shows this From name; the subject appears when you
                open the message.
              </p>
            ) : (
              <>
                <label>
                  Sender name
                  <input
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    disabled={busy}
                    maxLength={200}
                    placeholder="Your name"
                  />
                </label>
                <label>
                  Sender email
                  <input
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    disabled={busy}
                    maxLength={320}
                    placeholder="you@example.com"
                  />
                </label>
              </>
            )}
            {usesSenderName ? (
              <label className="compose-honorific-row">
                <input
                  type="checkbox"
                  checked={senderTitleEnabled}
                  disabled={busy}
                  onChange={(e) => setSenderTitleEnabled(e.target.checked)}
                />
                <span>Add title to sender name</span>
                {senderTitleEnabled ? (
                  <select
                    value={senderTitle}
                    disabled={busy}
                    onChange={(e) => setSenderTitle(e.target.value)}
                    aria-label="Sender title"
                  >
                    {nameHonorifics.map((h) => (
                      <option key={h.value} value={h.value}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </label>
            ) : null}
          </fieldset>

          <div className="compose-recipients">
            <label htmlFor="recipient-search">Recipients</label>
            {usesRecipientName ? (
              <p className="muted small">
                Tick a recipient to add Mr. / Mrs. / Miss (and similar) before
                their name in placeholders.
              </p>
            ) : null}
            <div className="recipient-chips">
              {selected.map((p) => {
                const ek = personKey(p);
                const titled = usesRecipientName && recipientTitleEnabled[ek];
                return (
                  <div key={p.email} className="recipient-chip-row">
                    {usesRecipientName ? (
                      <label className="recipient-title-tick">
                        <input
                          type="checkbox"
                          checked={Boolean(recipientTitleEnabled[ek])}
                          disabled={busy}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setRecipientTitleEnabled((prev) => ({
                              ...prev,
                              [ek]: on,
                            }));
                            if (on) {
                              setRecipientTitles((prev) => ({
                                ...prev,
                                [ek]:
                                  prev[ek] ||
                                  nameHonorifics[0]?.value ||
                                  "Mr.",
                              }));
                            }
                          }}
                          aria-label={`Add title for ${p.displayName}`}
                        />
                      </label>
                    ) : null}
                    <div className="recipient-chip-body">
                      <span className="recipient-chip-name">
                        {titled
                          ? titledRecipientName(p)
                          : p.displayName}
                      </span>
                      <em>{p.email}</em>
                      {titled ? (
                        <select
                          className="recipient-title-select"
                          value={
                            recipientTitles[ek] ||
                            nameHonorifics[0]?.value ||
                            "Mr."
                          }
                          disabled={busy}
                          onChange={(e) =>
                            setRecipientTitles((prev) => ({
                              ...prev,
                              [ek]: e.target.value,
                            }))
                          }
                          aria-label={`Title for ${p.displayName}`}
                        >
                          {nameHonorifics.map((h) => (
                            <option key={h.value} value={h.value}>
                              {h.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="recipient-chip-remove"
                      onClick={() => removePerson(p.email)}
                      title="Remove"
                      disabled={busy}
                      aria-label={`Remove ${p.displayName}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
            <input
              id="recipient-search"
              type="email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (showTypedAdd) tryAddTypedEmail();
                }
              }}
              placeholder="Type email and press Enter, or search directory"
              disabled={busy}
              autoComplete="off"
            />
            {searching ? <p className="muted small">Searching…</p> : null}
            {showTypedAdd ? (
              <ul className="recipient-hits">
                <li>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => tryAddTypedEmail()}
                  >
                    <strong>Add {typedRecipient.email}</strong>
                    <span>Press Enter</span>
                  </button>
                </li>
              </ul>
            ) : null}
            {hits.length > 0 ? (
              <ul className="recipient-hits">
                {hits.map((p) => {
                  const taken = selected.some(
                    (s) => personKey(s) === personKey(p),
                  );
                  return (
                    <li key={p.aadOid || p.email}>
                      <button
                        type="button"
                        disabled={taken || busy}
                        onClick={() => addPerson(p)}
                      >
                        <strong>{p.displayName}</strong>
                        <span>{p.email}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <div className="merge-fields-panel">
            <h3 className="card-section-title">Placeholders</h3>
            {placeholders.length === 0 ? (
              <p className="muted small">
                No placeholders defined on this card. Open the template, import
                Canva HTML with <code>{"{{tokens}}"}</code>, then save
                placeholder definitions.
              </p>
            ) : (
              <>
                <div className="merge-live-table-wrap">
                  <table className="merge-live-table">
                    <thead>
                      <tr>
                        <th>Placeholder</th>
                        <th>Meaning</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {placeholders.map((ph) => (
                        <tr key={ph.key.toLowerCase()}>
                          <td>
                            <code>{`{{${ph.key}}}`}</code>
                          </td>
                          <td>{ph.label}</td>
                          <td>
                            <span
                              className={`merge-source-badge is-${
                                ph.source === "perRecipient"
                                  ? "perRecipient"
                                  : ph.source === "shared"
                                    ? "shared"
                                    : ph.source.startsWith("sender")
                                      ? "sender"
                                      : "recipient"
                              }`}
                            >
                              {placeholderSourceLabel(ph.source)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!advancedCompose &&
                (hasAdvancedPlaceholders || hasReplaceableImages) ? (
                  <p className="notice compose-feature-notice">
                    This card includes{" "}
                    {hasAdvancedPlaceholders && hasReplaceableImages
                      ? "shared or per-person placeholders and replaceable images"
                      : hasAdvancedPlaceholders
                        ? "shared or per-person placeholders"
                        : "replaceable images"}
                    . Those features are unavailable for your account — only
                    designers and admins can fill them or change images when
                    composing. Your send uses automatic fields and the template
                    images as designed.
                  </p>
                ) : null}

                {sharedKeys.length > 0 ? (
                  advancedCompose ? (
                  <div className="merge-input-block">
                    <h4 className="merge-input-title">Shared fields</h4>
                    <p className="muted small">
                      Same value for every recipient in this send.
                    </p>
                    {placeholders
                      .filter((p) => p.source === "shared")
                      .map((ph) => (
                        <label key={ph.key}>
                          {ph.label} <code>{`{{${ph.key}}}`}</code>
                          <input
                            value={sharedFields[ph.key] ?? ""}
                            onChange={(e) => setShared(ph.key, e.target.value)}
                            disabled={busy}
                            maxLength={2000}
                            placeholder={ph.label}
                          />
                        </label>
                      ))}
                  </div>
                  ) : (
                    <div className="merge-input-block">
                      <h4 className="merge-input-title">Shared fields</h4>
                      <p className="muted small compose-unavailable">
                        Shared placeholders are unavailable for your account.
                        Ask a designer or admin to compose this card if custom
                        shared values are needed.
                      </p>
                    </div>
                  )
                ) : null}

                {perPersonKeys.length > 0 ? (
                  advancedCompose ? (
                  <div className="merge-input-block">
                    <h4 className="merge-input-title">Per-person fields</h4>
                    {!selected.length ? (
                      <p className="muted small">
                        Add recipients first, then fill each person’s values.
                      </p>
                    ) : (
                      selected.map((person) => (
                        <div
                          key={person.email}
                          className="merge-per-person-card"
                        >
                          <p className="merge-per-person-name">
                            <strong>{person.displayName}</strong>
                            <span className="muted">{person.email}</span>
                          </p>
                          {placeholders
                            .filter((p) => p.source === "perRecipient")
                            .map((ph) => (
                              <label key={ph.key}>
                                {ph.label} <code>{`{{${ph.key}}}`}</code>
                                <input
                                  value={
                                    perRecipientFields[personKey(person)]?.[
                                      ph.key
                                    ] ?? ""
                                  }
                                  onChange={(e) =>
                                    setPerPerson(
                                      person.email,
                                      ph.key,
                                      e.target.value,
                                    )
                                  }
                                  disabled={busy}
                                  maxLength={2000}
                                  placeholder={`For ${person.displayName}`}
                                />
                              </label>
                            ))}
                        </div>
                      ))
                    )}
                  </div>
                  ) : (
                    <div className="merge-input-block">
                      <h4 className="merge-input-title">Per-person fields</h4>
                      <p className="muted small compose-unavailable">
                        Per-person placeholders are unavailable for your account.
                        Ask a designer or admin to compose this card if each
                        recipient needs different values.
                      </p>
                    </div>
                  )
                ) : null}
              </>
            )}
          </div>

          {(sharedSlots.length > 0 || perPersonSlots.length > 0) ? (
            <div className="merge-fields-panel image-slots-compose">
              <h3 className="card-section-title">Images</h3>
              {advancedCompose ? (
                <>
                  <p className="muted small">
                    Uploads are cropped to the designed size. Leave blank to keep
                    the template image. For <strong>per-person</strong> slots,
                    upload a file for each recipient or that person keeps the
                    template image.
                  </p>

                  {sharedSlots.length > 0 ? (
                    <div className="merge-input-block">
                      <h4 className="merge-input-title">Shared images</h4>
                      {sharedSlots.map((slot) => {
                    const url = sharedImageUrls[slot.id];
                    const busyKey = `shared:${slot.id}`;
                    return (
                      <div key={slot.id} className="image-slot-upload">
                        <div className="image-slot-upload-meta">
                          <strong>{slot.label}</strong>
                          <span className="muted small">
                            {slot.designedWidth}×{slot.designedHeight} -{" "}
                            {imageSlotModeLabel(slot.mode)}
                          </span>
                        </div>
                        <div className="image-slot-upload-row">
                          {url ? (
                            <img
                              className="image-slot-thumb"
                              src={url}
                              alt=""
                            />
                          ) : slot.originalSrc ? (
                            <img
                              className="image-slot-thumb is-original"
                              src={slot.originalSrc}
                              alt=""
                            />
                          ) : null}
                          <label
                            className={`file-pick compact ${
                              busy || uploadingSlot ? "is-disabled" : ""
                            }`}
                          >
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/gif,image/webp"
                              disabled={busy || Boolean(uploadingSlot)}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) {
                                  void uploadSlotImage(slot, file, "shared");
                                }
                              }}
                            />
                            <span className="file-pick-btn">
                              {uploadingSlot === busyKey
                                ? "Uploading…"
                                : url
                                  ? "Replace"
                                  : "Upload"}
                            </span>
                          </label>
                          {url ? (
                            <button
                              type="button"
                              className="ghost"
                              disabled={busy || Boolean(uploadingSlot)}
                              onClick={() => clearSlotImage(slot.id, "shared")}
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {perPersonSlots.length > 0 ? (
                <div className="merge-input-block">
                  <h4 className="merge-input-title">Per-person images</h4>
                  {!selected.length ? (
                    <p className="muted small">
                      Add recipients first, then upload each person’s images.
                    </p>
                  ) : (
                    selected.map((person) => (
                      <div
                        key={person.email}
                        className="merge-per-person-card"
                      >
                        <p className="merge-per-person-name">
                          <strong>{person.displayName}</strong>
                          <span className="muted">{person.email}</span>
                        </p>
                        {perPersonSlots.map((slot) => {
                          const ek = personKey(person);
                          const url = perRecipientImageUrls[ek]?.[slot.id];
                          const busyKey = `person:${person.email}:${slot.id}`;
                          return (
                            <div key={slot.id} className="image-slot-upload">
                              <div className="image-slot-upload-meta">
                                <strong>{slot.label}</strong>
                                <span className="muted small">
                                  {slot.designedWidth}×{slot.designedHeight}
                                </span>
                              </div>
                              <div className="image-slot-upload-row">
                                {url ? (
                                  <img
                                    className="image-slot-thumb"
                                    src={url}
                                    alt=""
                                  />
                                ) : null}
                                <label
                                  className={`file-pick compact ${
                                    busy || uploadingSlot ? "is-disabled" : ""
                                  }`}
                                >
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/gif,image/webp"
                                    disabled={busy || Boolean(uploadingSlot)}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      e.target.value = "";
                                      if (file) {
                                        void uploadSlotImage(slot, file, {
                                          recipientEmail: person.email,
                                        });
                                      }
                                    }}
                                  />
                                  <span className="file-pick-btn">
                                    {uploadingSlot === busyKey
                                      ? "Uploading…"
                                      : url
                                        ? "Replace"
                                        : "Upload"}
                                  </span>
                                </label>
                                {url ? (
                                  <button
                                    type="button"
                                    className="ghost"
                                    disabled={busy || Boolean(uploadingSlot)}
                                    onClick={() =>
                                      clearSlotImage(slot.id, {
                                        recipientEmail: person.email,
                                      })
                                    }
                                  >
                                    Clear
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              ) : null}
                </>
              ) : (
                <p className="muted small compose-unavailable">
                  Image changes are unavailable for your account. The template
                  images will be used as designed. Ask a designer or admin if
                  you need custom pictures for this send.
                </p>
              )}
            </div>
          ) : null}

          <div className="surface-actions compose-send-actions">
            {error ? (
              <p className="error compose-inline-error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy || !compiled || selected.length === 0}
              onClick={() => void createDrafts()}
            >
              {busy
                ? mailMode === "smtp"
                  ? "Sending…"
                  : "Creating drafts…"
                : mailMode === "smtp"
                  ? `Send to ${selected.length} recipient${selected.length === 1 ? "" : "s"}`
                  : `Create ${selected.length} ${mailMode === "graph" ? "Outlook" : "mock"} draft${selected.length === 1 ? "" : "s"}`}
            </button>
            <Link className="ghost btn-link-ghost" to={`/cards/${template.id}`}>
              Cancel
            </Link>
          </div>
        </section>

        <section className="compose-preview">
          <div className="compose-preview-head">
            <h2 className="compose-preview-title">Preview</h2>
            {selected.length > 1 ? (
              <label className="compose-preview-pick">
                <span className="muted small">Show as</span>
                <select
                  value={previewPersonEmail}
                  onChange={(e) => setPreviewPersonEmail(e.target.value)}
                  disabled={busy}
                >
                  {selected.map((p) => (
                    <option key={p.email} value={personKey(p)}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <p className="muted small">
            Live merge for{" "}
            <strong>{previewPerson?.displayName ?? "Alex"}</strong>
            {" - "}
            sender <strong>{sampleCtx.senderName}</strong>.
          </p>
          {previewHtml ? (
            <OutlookDualPreview html={previewHtml} embedded />
          ) : (
            <p className="muted">Nothing to preview yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
