import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  honorificIncludesName,
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
import { Breadcrumbs, cardsCrumb } from "../components/Breadcrumbs";
import { ComposeFlowerDecor } from "../components/ComposeFlowerDecor";
import { canUseAdvancedCompose, homePath } from "../lib/roles";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 50;
const DIRECTORY_PAGE_SIZE = 20;
const DIRECTORY_DOMAIN_LIMIT = 200;
const UNKNOWN_EMAIL_NOTICE =
  "This email isn’t in the system. Please check and verify";
const SHARE_NO_RECIPIENT_NOTICE = "Add at least one recipient.";

/** `@example.com`, `example.com`, or `@example` → fetch the whole domain. */
function isDomainDirectoryQuery(raw: string): boolean {
  const t = raw.trim();
  if (!t || t.includes(" ") || EMAIL_RE.test(t)) return false;
  return t.startsWith("@") || /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(t);
}

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
  /** Prefix applied to the next person added. Empty = no title. */
  const [addPrefix, setAddPrefix] = useState("");
  /** When false, hide the search row until "Add another" is clicked. */
  const [recipientFormOpen, setRecipientFormOpen] = useState(false);
  const [nameHonorifics, setNameHonorifics] = useState<NameHonorific[]>([
    ...DEFAULT_NAME_HONORIFICS,
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [searching, setSearching] = useState(false);

  function reportError(message: string) {
    setError(message);
  }

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
    if (!token) return;
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = window.setTimeout(() => {
      const limit = isDomainDirectoryQuery(q)
        ? DIRECTORY_DOMAIN_LIMIT
        : DIRECTORY_PAGE_SIZE;
      api
        .directorySearch(token, q, limit)
        .then((res) => {
          setHits(res.people);
          setError(null);
        })
        .catch((err) => {
          setHits([]);
          setError(err instanceof Error ? err.message : "People search failed");
        })
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
      const previewTitle = previewKey ? recipientTitles[previewKey] || "" : "";
      const titledRecipient = withHonorific(
        previewTitle,
        recipientLabel,
        honorificIncludesName(previewTitle, nameHonorifics),
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

  function addPeople(people: DirectoryPerson[], title = addPrefix, clearSearch = false) {
    const room = Math.max(0, MAX_RECIPIENTS - selected.length);
    const fresh = people.filter(
      (p) => !selected.some((s) => personKey(s) === personKey(p)),
    );
    const toAdd = fresh.slice(0, room);
    if (!toAdd.length && people.length) {
      setRecipientTitles((prev) => {
        const next = { ...prev };
        for (const p of people) next[personKey(p)] = title;
        return next;
      });
      if (clearSearch) {
        setQuery("");
        setHits([]);
      }
      return;
    }
    if (fresh.length > room) {
      reportError(`You can send to ${MAX_RECIPIENTS} people at a time.`);
    }
    setSelected((prev) => {
      const seen = new Set(prev.map(personKey));
      const next = [...prev];
      for (const p of toAdd) {
        const ek = personKey(p);
        if (seen.has(ek)) continue;
        seen.add(ek);
        next.push(p);
      }
      return next;
    });
    setRecipientTitles((prev) => {
      const next = { ...prev };
      for (const p of toAdd) next[personKey(p)] = title;
      return next;
    });
    if (toAdd.length > 0 || clearSearch) {
      setQuery("");
      setHits([]);
    }
    if (toAdd.length > 0) setError(null);
  }

  function addPerson(person: DirectoryPerson, title = addPrefix) {
    addPeople([person], title, false);
  }

  function tryAddTypedEmail(title = addPrefix) {
    const person = parseTypedEmail(query);
    if (!person) {
      reportError("Enter a valid email address (e.g. you@example.com).");
      return;
    }
    const match = hits.find((p) => personKey(p) === personKey(person));
    if (!match) {
      reportError(UNKNOWN_EMAIL_NOTICE);
      return;
    }
    setError(null);
    addPeople([match], title, true);
  }

  /** Close the add form. Typed-but-not-listed addresses are discarded — only chips send. */
  function closeRecipientForm() {
    setRecipientFormOpen(false);
    setQuery("");
    setHits([]);
  }

  const typedRecipient = parseTypedEmail(query);
  const typedInDirectory = Boolean(
    typedRecipient &&
      hits.some((p) => personKey(p) === personKey(typedRecipient)),
  );
  const unknownEmail =
    Boolean(typedRecipient) && !searching && !typedInDirectory;

  function removePerson(email: string) {
    const key = email.trim().toLowerCase();
    setSelected((prev) => {
      const next = prev.filter((p) => personKey(p) !== key);
      if (next.length === 0) setRecipientFormOpen(false);
      return next;
    });
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

  function titledRecipientName(person: DirectoryPerson): string {
    const ek = personKey(person);
    const title = recipientTitles[ek] || "";
    return withHonorific(
      title,
      person.displayName,
      honorificIncludesName(title, nameHonorifics),
    );
  }

  function titledSenderName(): string {
    return withHonorific(
      "",
      senderName.trim() || user?.displayName || "",
    );
  }

  function resolvedSubjectFor(person: DirectoryPerson): string {
    const raw = subject.trim();
    if (!raw) return "";
    return applyMergeFields(
      raw,
      buildMergeFieldMapFromPlaceholders(placeholders, {
        recipientName: titledRecipientName(person),
        recipientEmail: person.email,
        senderName:
          titledSenderName().trim() || user?.displayName || "You",
        senderEmail:
          senderEmail.trim() || user?.email || "you@example.com",
        shared: sharedFields,
        perRecipient: perRecipientFields[personKey(person)] ?? {},
      }),
    );
  }

  function renderRecipientSearch() {
    const title = addPrefix;
    const canTypedAdd = Boolean(typedRecipient);
    const selectedKey = (p: DirectoryPerson) =>
      selected.some((s) => personKey(s) === personKey(p));
    const sameTitle = (p: DirectoryPerson) =>
      (recipientTitles[personKey(p)] || "") === title;
    const visibleHits = hits.filter((p) => !selectedKey(p) || !sameTitle(p));
    const newHits = visibleHits.filter((p) => !selectedKey(p));
    const typedSelected = typedRecipient ? selectedKey(typedRecipient) : false;
    const typedSameTitle = typedRecipient ? sameTitle(typedRecipient) : false;
    const showUnknownNotice = unknownEmail && (!typedSelected || !typedSameTitle);
    return (
      <>
        <div className="recipient-add-row">
          {usesRecipientName ? (
            <select
              className="recipient-prefix-select"
              value={addPrefix}
              disabled={busy}
              onChange={(e) => setAddPrefix(e.target.value)}
              aria-label="Name prefix"
            >
              <option value="">No title</option>
              {nameHonorifics.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          ) : null}
          <input
            id="recipient-search"
            type="text"
            inputMode="email"
            value={query}
            onFocus={() => {
              if (error === SHARE_NO_RECIPIENT_NOTICE) setError(null);
            }}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (unknownEmail) {
                  reportError(UNKNOWN_EMAIL_NOTICE);
                  return;
                }
                if (canTypedAdd && typedInDirectory) tryAddTypedEmail(title);
              }
            }}
            placeholder="type name or email"
            disabled={busy}
            autoComplete="off"
          />
        </div>
        {addPrefix && !honorificIncludesName(addPrefix, nameHonorifics) ? (
          <p className="muted small recipient-standalone-hint">
            {addPrefix} is used on its own - the card will say Dear {addPrefix},
            without their name.
          </p>
        ) : null}
        {searching ? <p className="muted small">Searching…</p> : null}
        {showUnknownNotice ? (
          <ul className="recipient-hits" role="status">
            <li className="recipient-hit-notice">
              <p>{UNKNOWN_EMAIL_NOTICE}</p>
            </li>
          </ul>
        ) : null}
        {visibleHits.length > 0 ? (
          <div className="recipient-hits-wrap">
            {newHits.length > 1 ? (
              <div className="recipient-hits-toolbar">
                <span className="muted small">
                  {newHits.length} {newHits.length === 1 ? "person" : "people"}
                </span>
                <button
                  type="button"
                  className="ghost recipient-add-all"
                  disabled={busy}
                  onClick={() => addPeople(newHits, title, true)}
                >
                  Add everyone
                </button>
              </div>
            ) : null}
            <ul className="recipient-hits">
              {visibleHits.map((p) => {
                const update = selectedKey(p);
                return (
                  <li key={p.aadOid || p.email}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => addPerson(p, title)}
                    >
                      <strong>
                        {update ? `Update ${p.displayName}` : p.displayName}
                      </strong>
                      <span>
                        {update
                          ? `Change title to ${title || "no title"}`
                          : p.email}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
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

  function sendValidationError(): string | null {
    if (!token || !template || !id) return "Not ready to send yet.";
    if (!compiled) {
      return "No compiled email HTML yet. Import a Canva ZIP (or HTML) on the card page first.";
    }
    if (!subject.trim()) return "Subject is required.";
    if (!selected.length) return SHARE_NO_RECIPIENT_NOTICE;
    if (!senderName.trim() && !user?.displayName) {
      return "Your account name is missing. Sign in again and retry.";
    }
    if (!EMAIL_RE.test((senderEmail.trim() || user?.email || "").trim())) {
      return "Your account email is missing or invalid. Sign in again and retry.";
    }
    return validateMergeInputs();
  }

  function requestSend() {
    const err = sendValidationError();
    if (err) {
      reportError(err);
      return;
    }
    setConfirmSend(true);
  }

  async function createDrafts() {
    const err = sendValidationError();
    if (err) {
      reportError(err);
      setConfirmSend(false);
      return;
    }

    if (!token || !template) return;

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
        senderName: titledSenderName().trim() || user?.displayName || "",
        senderEmail: (user?.email || senderEmail).trim().toLowerCase(),
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
      setConfirmSend(false);
      reportError(err instanceof Error ? err.message : "Could not create drafts");
    } finally {
      setBusy(false);
    }
  }

  const advancedCompose = canUseAdvancedCompose(user);
  const usesRecipientName = useMemo(() => {
    if (placeholders.some((p) => p.source === "recipientName")) return true;
    if (detectMergeFields(subject).some((k) => isRecipientNameToken(k))) return true;
    return detectMergeFields(compiled).some((k) => isRecipientNameToken(k));
  }, [placeholders, subject, compiled]);

  useEffect(() => {
    if (!confirmSend) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) setConfirmSend(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmSend, busy]);

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

  const composeCrumbs = [cardsCrumb, { label: "Prepare" }];
  const showRecipientSearch = recipientFormOpen;

  return (
    <div className="page compose-page">
      <ComposeFlowerDecor />
      {composeCrumbs.length ? <Breadcrumbs items={composeCrumbs} /> : null}
      <header className="page-header">
        <div>
          <h1>Share</h1>
          
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
              <div className="compose-section-titles">
                <h2 className="compose-section-title">To</h2>
                <p className="compose-section-hint">
                  {selected.length > 0
                    ? "People who will receive this card."
                    : usesRecipientName
                      ? "Select a title, then search by name or office email"
                      : "Search or type an email. Press Enter ( ⏎ ) to add."}
                </p>
              </div>
            </header>
            <div className="compose-section-body">
              {selected.length > 0 ? renderPersonChips(selected) : null}
              {selected.length === 0 ? (
                <>
                  {renderRecipientSearch()}
                  {unknownEmail ? null : typedRecipient ? (
                    <p className="muted small recipient-draft-hint">
                      Press Enter ( ⏎ ) or click Add below to list this address.
                    </p>
                  ) : (
                    <p className="muted small recipient-draft-hint">
                      Press Enter ( ⏎ ) to add.
                    </p>
                  )}
                </>
              ) : null}
            </div>
          </section>

          {selected.length > 0 ? (
            <section className="compose-section" data-tour="compose-add-recipient">
              <div className="compose-section-body">
                {showRecipientSearch ? (
                  <>
                    <div className="recipient-add-open-row">
                      <div className="recipient-add-open-fields">
                        {renderRecipientSearch()}
                      </div>
                      <button
                        type="button"
                        className="recipient-add-cancel"
                        disabled={busy}
                        title="Cancel adding"
                        aria-label="Cancel adding"
                        onClick={closeRecipientForm}
                      >
                        ×
                      </button>
                    </div>
                    {unknownEmail ? null : typedRecipient ? (
                      <p className="muted small recipient-draft-hint">
                        Press Enter ( ⏎ ) or click Add below to list this address. Cancel
                        leaves it out.
                      </p>
                    ) : (
                      <p className="muted small recipient-draft-hint">
                        Press Enter ( ⏎ ) to add.
                      </p>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    className="ghost recipient-add-more-btn"
                    disabled={busy}
                    onClick={() => setRecipientFormOpen(true)}
                  >
                    + Add another
                  </button>
                )}
              </div>
            </section>
          ) : null}

          {advancedCompose ? (
          <section className="compose-section">
            <header className="compose-section-head">
              <div className="compose-section-titles">
                <h2 className="compose-section-title">Subject</h2>
                <p className="compose-section-hint">
                  Edit if you like. Names from the card fill in on their own.
                </p>
              </div>
            </header>
            <div className="compose-section-body">
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
              </div>
            </div>
          </section>
          ) : null}

          {advancedCompose ? (
            <>
              <section className="compose-section compose-section--tools">
                <header className="compose-section-head">
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
            <Link className="ghost btn-link-ghost" to={homePath(user)}>
              Back to cards
            </Link>
            <button
              type="button"
              disabled={busy || !compiled}
              onClick={requestSend}
            >
              Share
            </button>
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
          {previewHtml ? (
            <OutlookDualPreview
              html={previewHtml}
              embedded
              showCopyActions={false}
              subject={previewSubject || subject}
            />
          ) : (
            <p className="muted">Nothing to preview yet.</p>
          )}
        </section>
      </div>

      {confirmSend
        ? createPortal(
            <div
              className="app-modal-backdrop"
              role="presentation"
              onClick={() => !busy && setConfirmSend(false)}
            >
              <div
                className="app-modal send-confirm-modal"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="send-confirm-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="send-confirm-title">Share</h2>
                
                <ul className="send-confirm-list">
                  {selected.map((p) => {
                    const personSubject = resolvedSubjectFor(p);
                    return (
                      <li key={personKey(p)}>
                        <span className="send-confirm-name">
                          {titledRecipientName(p)}
                        </span>
                        {personSubject ? (
                          <span className="send-confirm-person-subject">
                            Subject: {personSubject}
                          </span>
                        ) : null}
                        <span className="send-confirm-email">{p.email}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => setConfirmSend(false)}
                  >
                    Go back
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void createDrafts()}
                  >
                    {busy ? "Sharing…" : "Share"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
