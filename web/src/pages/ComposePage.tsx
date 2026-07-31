import { useEffect, useMemo, useState } from "react";
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
  parsePlaceholdersFromDesignJson,
  perRecipientPlaceholderKeys,
  placeholderSourceLabel,
  sharedPlaceholderKeys,
  type PlaceholderDef,
} from "../lib/mergeFields";
import { OutlookDualPreview } from "../components/OutlookDualPreview";

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
  const [previewPersonEmail, setPreviewPersonEmail] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DirectoryPerson[]>([]);
  const [selected, setSelected] = useState<DirectoryPerson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mailMode, setMailMode] = useState("mock");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api
      .getMode()
      .then((m) => setMailMode(m.mailMode))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!token || !id) return;
    api
      .template(token, id)
      .then(({ template: t }) => {
        setTemplate(t);
        setSubject((prev) => prev || `Thank you — ${t.name}`);
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

  const placeholders: PlaceholderDef[] = useMemo(
    () =>
      parsePlaceholdersFromDesignJson(
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
    () => ({
      recipientName: previewPerson?.displayName ?? "Alex",
      recipientEmail: previewPerson?.email ?? "alex@example.com",
      senderName: senderName.trim() || user?.displayName || "You",
      senderEmail: senderEmail.trim() || user?.email || "you@example.com",
      shared: sharedFields,
      perRecipient: previewPerson
        ? (perRecipientFields[personKey(previewPerson)] ?? {})
        : {},
    }),
    [
      previewPerson,
      senderName,
      senderEmail,
      sharedFields,
      perRecipientFields,
      user,
    ],
  );

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
    return resolveHtmlImageSrcsClient(body, assets, API_URL);
  }, [template, compiled, assets, placeholders, sampleCtx]);

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
      setError("Enter a valid email address (e.g. you@example.com).");
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

  function validateMergeInputs(): string | null {
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
      setError(
        "No compiled email HTML yet. Import a Canva ZIP (or HTML) on the card page first.",
      );
      return;
    }
    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    if (!selected.length) {
      setError("Pick at least one recipient.");
      return;
    }
    if (!senderName.trim()) {
      setError("Sender name is required.");
      return;
    }
    if (!EMAIL_RE.test(senderEmail.trim())) {
      setError("Enter a valid sender email.");
      return;
    }
    const mergeErr = validateMergeInputs();
    if (mergeErr) {
      setError(mergeErr);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const trimmedShared: Record<string, string> = {};
      for (const key of sharedKeys) {
        trimmedShared[key] = (sharedFields[key] ?? "").trim();
      }

      const { job } = await api.createDraftJob(token, {
        templateId: template.id,
        templateVersionId: template.versions[0]?.id,
        subject: subject.trim(),
        senderName: senderName.trim(),
        senderEmail: senderEmail.trim().toLowerCase(),
        sharedFields: trimmedShared,
        recipients: selected.map((p) => {
          const ek = personKey(p);
          const fields: Record<string, string> = {};
          for (const key of perPersonKeys) {
            fields[key] = (perRecipientFields[ek]?.[key] ?? "").trim();
          }
          return {
            aadOid: p.aadOid,
            email: p.email,
            displayName: p.displayName,
            ...(Object.keys(fields).length ? { fields } : {}),
          };
        }),
      });
      navigate(`/drafts/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create drafts");
    } finally {
      setBusy(false);
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
        <Link to="/cards">Back to cards</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <p className="back">
        <Link to={`/cards/${template.id}`}>← {template.name}</Link>
      </p>
      <header className="page-header">
        <div>
          <p className="eyebrow">Compose</p>
          <h1>
            {mailMode === "smtp" ? "Send email" : "Create Outlook drafts"}
          </h1>
          <p className="lede">
            Fill values for the placeholders the template owner defined. Auto
            fields use recipients and sender; shared and per-person fields need
            your input. The saved template is not changed.
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

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
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy}
              maxLength={300}
            />
          </label>

          <fieldset className="choice-set compose-sender">
            <legend>Sender</legend>
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
          </fieldset>

          <div className="compose-recipients">
            <label htmlFor="recipient-search">Recipients</label>
            <div className="recipient-chips">
              {selected.map((p) => (
                <button
                  key={p.email}
                  type="button"
                  className="recipient-chip"
                  onClick={() => removePerson(p.email)}
                  title="Remove"
                >
                  <span>{p.displayName}</span>
                  <em>{p.email}</em>
                  <span aria-hidden="true">×</span>
                </button>
              ))}
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

          <div className="surface-actions">
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
            {" · "}
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
