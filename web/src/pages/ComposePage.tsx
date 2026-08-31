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
  /** email → title (Mr./Mrs./…). Empty string = no title. */
  const [recipientTitles, setRecipientTitles] = useState<
    Record<string, string>
  >({});
  /** Prefix groups the composer opted into (not all admin prefixes). */
  const [activePrefixGroups, setActivePrefixGroups] = useState<string[]>([]);
  const [prefixToAdd, setPrefixToAdd] = useState("");
  /** Which prefix group the current search belongs to ("" = no title). */
  const [searchScope, setSearchScope] = useState("");
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
      const recipientLabel = previewPerson?.displayName?.trim() || "recipient";
      const titledRecipient = withHonorific(
        previewKey ? recipientTitles[previewKey] || "" : "",
        recipientLabel,
      );
      const titledSender = withHonorific(
        "",
        senderName.trim() || user?.displayName || "You",
      );
      return {
        recipientName: titledRecipient,
        recipientEmail: previewPerson?.email ?? "",
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
      recipientTitles,
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

  function addPerson(person: DirectoryPerson, title = "") {
    const ek = personKey(person);
    setSelected((prev) => {
      if (prev.some((p) => personKey(p) === ek)) return prev;
      return [...prev, person];
    });
    setRecipientTitles((prev) => ({ ...prev, [ek]: title }));
    setQuery("");
    setHits([]);
  }

  function tryAddTypedEmail(title = searchScope) {
    const person = parseTypedEmail(query);
    if (!person) {
      reportError("Enter a valid email address (e.g. you@example.com).");
      return;
    }
    setError(null);
    addPerson(person, title);
  }

  const typedRecipient = parseTypedEmail(query);

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
    setRecipientTitles((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function peopleForTitle(title: string): DirectoryPerson[] {
    return selected.filter(
      (p) => (recipientTitles[personKey(p)] || "") === title,
    );
  }

  function addPrefixGroup(value: string) {
    const title = value.trim();
    if (!title) return;
    if (!nameHonorifics.some((h) => h.value === title)) return;
    setActivePrefixGroups((prev) =>
      prev.includes(title) ? prev : [...prev, title],
    );
    setPrefixToAdd("");
    setSearchScope(title);
    setQuery("");
    setHits([]);
  }

  function removePrefixGroup(title: string) {
    setActivePrefixGroups((prev) => prev.filter((t) => t !== title));
    setRecipientTitles((prev) => {
      const next = { ...prev };
      for (const [email, t] of Object.entries(next)) {
        if (t === title) next[email] = "";
      }
      return next;
    });
    if (searchScope === title) {
      setSearchScope("");
      setQuery("");
      setHits([]);
    }
  }

  function titledRecipientName(person: DirectoryPerson): string {
    const ek = personKey(person);
    return withHonorific(recipientTitles[ek] || "", person.displayName);
  }

  function titledSenderName(): string {
    return withHonorific(
      "",
      senderName.trim() || user?.displayName || "",
    );
  }

  function renderRecipientSearch(title: string, inputId: string) {
    const active = searchScope === title;
    const typed = active ? typedRecipient : null;
    const canTypedAdd = Boolean(typed);
    const activeHits = active ? hits : [];
    return (
      <>
        <input
          id={inputId}
          type="email"
          value={active ? query : ""}
          onChange={(e) => {
            setSearchScope(title);
            setQuery(e.target.value);
          }}
          onFocus={() => {
            if (searchScope !== title) {
              setSearchScope(title);
              setQuery("");
              setHits([]);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (canTypedAdd) tryAddTypedEmail(title);
            }
          }}
          placeholder={
            title
              ? `Add under ${nameHonorifics.find((h) => h.value === title)?.label ?? title}…`
              : usesRecipientName
                ? "No title - type email or search directory"
                : "Type email and press Enter, or search directory"
          }
          disabled={busy}
          autoComplete="off"
        />
        {active && searching ? (
          <p className="muted small">Searching…</p>
        ) : null}
        {active && canTypedAdd && typed ? (
          <ul className="recipient-hits">
            <li>
              <button
                type="button"
                disabled={busy}
                onClick={() => tryAddTypedEmail(title)}
              >
                <strong>
                  {selected.some((s) => personKey(s) === personKey(typed))
                    ? `Move ${typed.email} here`
                    : `Add ${typed.email}`}
                </strong>
                <span>Press Enter</span>
              </button>
            </li>
          </ul>
        ) : null}
        {active && activeHits.length > 0 ? (
          <ul className="recipient-hits">
            {activeHits.map((p) => {
              const ek = personKey(p);
              const alreadyHere =
                selected.some((s) => personKey(s) === ek) &&
                (recipientTitles[ek] || "") === title;
              const elsewhere = selected.some((s) => personKey(s) === ek);
              return (
                <li key={p.aadOid || p.email}>
                  <button
                    type="button"
                    disabled={alreadyHere || busy}
                    onClick={() => addPerson(p, title)}
                  >
                    <strong>
                      {elsewhere && !alreadyHere
                        ? `Move ${p.displayName}`
                        : p.displayName}
                    </strong>
                    <span>{p.email}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </>
    );
  }

  function renderPersonChips(people: DirectoryPerson[]) {
    return (
      <div className="recipient-chips">
        {people.map((p) => (
          <div key={p.email} className="recipient-chip-row">
            <div className="recipient-chip-body">
              <span className="recipient-chip-name">
                {titledRecipientName(p)}
              </span>
              <em>{p.email}</em>
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
        ))}
      </div>
    );
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
    if (!senderName.trim() && !user?.displayName && mailMode !== "smtp") {
      reportError("Your account name is missing. Sign in again and retry.");
      return;
    }
    if (
      mailMode !== "smtp" &&
      !EMAIL_RE.test((senderEmail.trim() || user?.email || "").trim())
    ) {
      reportError("Your account email is missing or invalid. Sign in again and retry.");
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
          (mailMode === "smtp"
            ? "Gratitude cards"
            : senderName.trim() || user?.displayName || ""),
        senderEmail:
          mailMode === "smtp"
            ? (smtpFrom || senderEmail).trim().toLowerCase()
            : (senderEmail.trim() || user?.email || "").trim().toLowerCase(),
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

  const usesRecipientName = useMemo(() => {
    if (placeholders.some((p) => p.source === "recipientName")) return true;
    return detectMergeFields(subject).some((k) => isRecipientNameToken(k));
  }, [placeholders, subject]);

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
        <Link to="/marketplace">Back to Browse cards</Link>
      </div>
    );
  }

  const fromDesigns =
    canManageDesigns(user) && template.owner.id === user?.id;
  const parentCrumb = fromDesigns
    ? { label: "My cards", to: "/cards" }
    : { label: "Browse cards", to: "/marketplace" };
  const parentDetailTo = fromDesigns
    ? `/cards/${template.id}`
    : `/marketplace/${template.id}`;
  const cancelTo = fromDesigns ? `/cards/${template.id}` : "/marketplace";
  const composeCrumbs = fromDesigns
    ? [
        { label: "Home", to: "/" },
        emailsCrumb,
        parentCrumb,
        { label: template.name, to: parentDetailTo },
        { label: "Send" },
      ]
    : [parentCrumb, { label: "Send" }];

  return (
    <div className="page">
      <ToastBanner
        key={errorTick}
        message={error}
        onClose={dismissError}
      />
      <Breadcrumbs items={composeCrumbs} />
      <header className="page-header">
        <div>
          <p className="eyebrow">Cards</p>
          <h1>Send this</h1>
          <p className="lede">
            {advancedCompose
              ? "Who it’s for, a few details, then a look at how it will arrive."
              : "Who it’s for, then a look at how it will arrive."}
          </p>
        </div>
      </header>

      {!compiled ? (
        <p className="notice">
          This card is not ready to send yet.{" "}
          <Link to={`/cards/${template.id}`}>Open the card</Link> to finish
          setup.
        </p>
      ) : null}

      <div className="compose-layout">
        <aside
          className={`compose-panel ${advancedCompose ? "is-advanced" : "is-simple"}`}
        >
          <section className="compose-section" data-tour="compose-recipients">
            <header className="compose-section-head">
              <span className="compose-section-step" aria-hidden>
                1
              </span>
              <div className="compose-section-titles">
                <h2 className="compose-section-title">Who is this for?</h2>
                <p className="compose-section-hint">
                  {usesRecipientName
                    ? "Search for the person. Add a title if you want Mr. or Mrs. on the card."
                    : "Search for a colleague or type an email and press Enter."}
                </p>
              </div>
            </header>
            <div className="compose-section-body">
              <div className="recipient-prefix-groups">
                <section
                  className={`recipient-prefix-group ${usesRecipientName ? "" : "is-plain"}`.trim()}
                >
                  {usesRecipientName ? (
                    <h4 className="recipient-prefix-title">Without prefix</h4>
                  ) : null}
                  {peopleForTitle("").length > 0
                    ? renderPersonChips(peopleForTitle(""))
                    : null}
                  {renderRecipientSearch("", "recipient-search")}
                </section>

                {usesRecipientName
                  ? activePrefixGroups.map((title) => {
                      const label =
                        nameHonorifics.find((h) => h.value === title)?.label ??
                        title;
                      const people = peopleForTitle(title);
                      return (
                        <section
                          key={title}
                          className="recipient-prefix-group"
                        >
                          <div className="recipient-prefix-head">
                            <h4 className="recipient-prefix-title">{label}</h4>
                            <button
                              type="button"
                              className="ghost recipient-prefix-remove"
                              disabled={busy}
                              onClick={() => removePrefixGroup(title)}
                            >
                              Remove
                            </button>
                          </div>
                          {advancedCompose ? (
                            <p className="muted small">
                              People added here become{" "}
                              <strong>{label} Name</strong> in the email.
                            </p>
                          ) : null}
                          {people.length > 0 ? renderPersonChips(people) : null}
                          {renderRecipientSearch(
                            title,
                            `recipient-search-${title}`,
                          )}
                        </section>
                      );
                    })
                  : null}
              </div>

              {usesRecipientName ? (
                <div className="recipient-prefix-add">
                  {(() => {
                    const available = nameHonorifics.filter(
                      (h) => !activePrefixGroups.includes(h.value),
                    );
                    if (available.length === 0) {
                      return (
                        <p className="muted small">
                          All configured prefixes are already added.
                        </p>
                      );
                    }
                    const selectedValue =
                      prefixToAdd &&
                      available.some((h) => h.value === prefixToAdd)
                        ? prefixToAdd
                        : available[0].value;
                    return (
                      <>
                        <select
                          value={selectedValue}
                          disabled={busy}
                          onChange={(e) => setPrefixToAdd(e.target.value)}
                          aria-label="Prefix to add"
                        >
                          {available.map((h) => (
                            <option key={h.value} value={h.value}>
                              {h.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => addPrefixGroup(selectedValue)}
                        >
                          Add prefix
                        </button>
                      </>
                    );
                  })()}
                </div>
              ) : null}
            </div>
          </section>

          <section className="compose-section" data-tour="compose-subject">
            <header className="compose-section-head">
              <span className="compose-section-step" aria-hidden>
                2
              </span>
              <div className="compose-section-titles">
                <h2 className="compose-section-title">Subject</h2>
                <p className="compose-section-hint">
                  {advancedCompose
                    ? "Edit if you like. Names from the card fill in on their own."
                    : "Comes with the card. Names fill in after you choose people."}
                </p>
              </div>
            </header>
            <div className="compose-section-body">
              {advancedCompose ? (
                <div className="form-stack">
                  <label>
                    <span className="visually-hidden">Subject</span>
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
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
                    />
                  </label>
                  {previewSubject && previewSubject !== subject.trim() ? (
                    <p className="compose-subject-preview muted small">
                      Preview: <strong>{previewSubject}</strong>
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="compose-subject-readonly">
                  {selected.length > 0
                    ? previewSubject || subject || "Thank you"
                    : subject || "Thank you"}
                </p>
              )}
            </div>
          </section>

          {advancedCompose ? (
            <>
              <section className="compose-section compose-section--tools">
                <header className="compose-section-head">
                  <span className="compose-section-step" aria-hidden>
                    ·
                  </span>
                  <div className="compose-section-titles">
                    <h2 className="compose-section-title">Placeholders</h2>
                    <p className="compose-section-hint">
                      Values filled into the card for this send.
                    </p>
                  </div>
                </header>
                <div className="compose-section-body merge-fields-panel">
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

                {sharedKeys.length > 0 ? (
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
                ) : null}

                {perPersonKeys.length > 0 ? (
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
                ) : null}
              </>
            )}
                </div>
              </section>

              {(sharedSlots.length > 0 || perPersonSlots.length > 0) ? (
                <section className="compose-section compose-section--tools">
                  <header className="compose-section-head">
                    <span className="compose-section-step" aria-hidden>
                      ·
                    </span>
                    <div className="compose-section-titles">
                      <h2 className="compose-section-title">Images</h2>
                      <p className="compose-section-hint">
                        Optional replacements; leave blank to keep the template
                        image.
                      </p>
                    </div>
                  </header>
                  <div className="compose-section-body merge-fields-panel image-slots-compose">
                  <p className="muted small">
                    Uploads are cropped to the designed size. For{" "}
                    <strong>per-person</strong> slots, upload a file for each
                    recipient or that person keeps the template image.
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
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          <div className="compose-panel-footer" data-tour="compose-send">
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
                  ? `Send to ${selected.length} ${selected.length === 1 ? "person" : "people"}`
                  : `Create ${selected.length} ${mailMode === "graph" ? "Outlook" : "mock"} draft${selected.length === 1 ? "" : "s"}`}
            </button>
            <Link className="ghost btn-link-ghost" to={cancelTo}>
              Cancel
            </Link>
          </div>
        </aside>

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
            {advancedCompose ? (
              <>
                Live merge for{" "}
                <strong>
                  {previewPerson?.displayName ?? "recipient"}
                </strong>
                {" - "}
                sender <strong>{sampleCtx.senderName}</strong>.
              </>
            ) : (
              <>
                How it looks for{" "}
                <strong>
                  {previewPerson?.displayName ?? "the recipient"}
                </strong>
                .
              </>
            )}
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
