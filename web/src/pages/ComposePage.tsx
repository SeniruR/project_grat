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
  buildMergeFieldMap,
  describeMergeField,
  detectMergeFields,
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

export function ComposePage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<TemplateSummary | null>(null);
  const [subject, setSubject] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
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

  const detectedFields = useMemo(
    () =>
      detectMergeFields(
        [
          compiled,
          template?.headerHtml ?? "",
          template?.footerHtml ?? "",
        ].join("\n"),
      ),
    [compiled, template?.headerHtml, template?.footerHtml],
  );

  const previewHtml = useMemo(() => {
    if (!template || !compiled) return "";
    const sampleName = selected[0]?.displayName ?? "Alex";
    const sampleEmail = selected[0]?.email ?? "alex@example.com";
    let body = resolveHtmlImageSrcsClient(compiled, assets, API_URL);
    body = wrapWithHeaderFooter(
      body,
      template.headerHtml,
      template.footerHtml,
    );
    body = applyMergeFields(
      body,
      buildMergeFieldMap({
        recipientName: sampleName,
        recipientEmail: sampleEmail,
        senderName: senderName.trim() || user?.displayName || "You",
        senderEmail: senderEmail.trim() || user?.email || "you@example.com",
      }),
    );
    return resolveHtmlImageSrcsClient(body, assets, API_URL);
  }, [
    template,
    compiled,
    assets,
    selected,
    senderName,
    senderEmail,
    user,
  ]);

  function addPerson(person: DirectoryPerson) {
    setSelected((prev) => {
      if (prev.some((p) => p.email.toLowerCase() === person.email.toLowerCase())) {
        return prev;
      }
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
    !selected.some(
      (s) => s.email.toLowerCase() === typedRecipient.email.toLowerCase(),
    );

  function removePerson(email: string) {
    setSelected((prev) =>
      prev.filter((p) => p.email.toLowerCase() !== email.toLowerCase()),
    );
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
      setError("Sender name is required for merge fields.");
      return;
    }
    if (!EMAIL_RE.test(senderEmail.trim())) {
      setError("Enter a valid sender email.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { job } = await api.createDraftJob(token, {
        templateId: template.id,
        templateVersionId: template.versions[0]?.id,
        subject: subject.trim(),
        senderName: senderName.trim(),
        senderEmail: senderEmail.trim().toLowerCase(),
        recipients: selected.map((p) => ({
          aadOid: p.aadOid,
          email: p.email,
          displayName: p.displayName,
        })),
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
            Type an email and press Enter, or search the directory. Merge fields
            in the card HTML (like{" "}
            <code>{"{{recipientName}}"}</code>) are filled per recipient —
            the saved template is not changed.
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
            <legend>Sender (for merge fields)</legend>
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
            <p className="muted small">
              Fills <code>{"{{senderName}}"}</code> and{" "}
              <code>{"{{senderEmail}}"}</code> in the email. Defaults to your
              account.
            </p>
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
                    (s) => s.email.toLowerCase() === p.email.toLowerCase(),
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
            <p className="muted small">
              Type any email address, or pick from directory search.{" "}
              <code>{"{{recipientName}}"}</code> /{" "}
              <code>{"{{recipientEmail}}"}</code> are filled per person.
            </p>
          </div>

          <div className="merge-fields-panel">
            <h3 className="card-section-title">Merge fields in this card</h3>
            {detectedFields.length > 0 ? (
              <ul className="merge-fields-list">
                {detectedFields.map((key) => (
                  <li key={key.toLowerCase()}>
                    <code>{`{{${key}}}`}</code>
                    <span className="muted">{describeMergeField(key)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">
                No <code>{"{{…}}"}</code> tokens found. In Canva, type tokens as
                normal text (e.g. <code>{"{{recipientName}}"}</code>), then
                re-export the HTML ZIP.
              </p>
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
          <h2 className="compose-preview-title">Preview</h2>
          <p className="muted small">
            Sample merge uses recipient{" "}
            <strong>
              {selected[0]?.displayName ?? "Alex"}
            </strong>
            {" · "}
            sender <strong>{senderName.trim() || user?.displayName || "You"}</strong>.
            Each send fills tokens per recipient; the template is unchanged.
          </p>
          {previewHtml ? (
            <OutlookDualPreview html={previewHtml} />
          ) : (
            <p className="muted">Nothing to preview yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
