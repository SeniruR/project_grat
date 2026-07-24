import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type DirectoryPerson,
  type TemplateSummary,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { wrapWithHeaderFooter } from "../designer/compile";
import { resolveHtmlImageSrcsClient } from "../lib/htmlAssets";
import { OutlookDualPreview } from "../components/OutlookDualPreview";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function ComposePage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<TemplateSummary | null>(null);
  const [subject, setSubject] = useState("");
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
    if (!token) return;
    const q = query.trim();
    if (q.length < 1) {
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

  const previewHtml = useMemo(() => {
    if (!template || !compiled) return "";
    const sampleName = selected[0]?.displayName ?? user?.displayName ?? "Alex";
    const sampleEmail = selected[0]?.email ?? user?.email ?? "alex@example.com";
    let body = resolveHtmlImageSrcsClient(compiled, assets, API_URL);
    body = wrapWithHeaderFooter(
      body,
      template.headerHtml,
      template.footerHtml,
    );
    body = body
      .replace(/\{\{\s*name\s*\}\}/gi, sampleName)
      .replace(/\{\{\s*displayName\s*\}\}/gi, sampleName)
      .replace(/\{\{\s*recipientName\s*\}\}/gi, sampleName)
      .replace(/\{\{\s*email\s*\}\}/gi, sampleEmail)
      .replace(/\{\{\s*recipientEmail\s*\}\}/gi, sampleEmail);
    return resolveHtmlImageSrcsClient(body, assets, API_URL);
  }, [template, compiled, assets, selected, user]);

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

  function removePerson(email: string) {
    setSelected((prev) =>
      prev.filter((p) => p.email.toLowerCase() !== email.toLowerCase()),
    );
  }

  async function createDrafts() {
    if (!token || !template || !id) return;
    if (!compiled) {
      setError(
        "No compiled email HTML yet. Save & compile in Designer (or Recompile preview) first.",
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

    setBusy(true);
    setError(null);
    try {
      const { job } = await api.createDraftJob(token, {
        templateId: template.id,
        templateVersionId: template.versions[0]?.id,
        subject: subject.trim(),
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
          <h1>Create Outlook drafts</h1>
          <p className="lede">
            Pick recipients from the directory.{" "}
            {mailMode === "graph"
              ? "Graph mode creates real Outlook drafts in the sender mailbox."
              : "Mock mode stores drafts in the app (set MAIL_MODE=graph for Outlook)."}
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {!compiled ? (
        <p className="notice">
          This card has no compiled HTML yet.{" "}
          <Link to={`/cards/${template.id}`}>Open the card</Link> and recompile,
          or use Designer → Save &amp; compile.
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search directory (name or email)"
              disabled={busy}
              autoComplete="off"
            />
            {searching ? <p className="muted small">Searching…</p> : null}
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
              Merge fields in the HTML:{" "}
              <code>{"{{name}}"}</code>, <code>{"{{email}}"}</code> (filled per
              recipient).
            </p>
          </div>

          <div className="surface-actions">
            <button
              type="button"
              disabled={busy || !compiled || selected.length === 0}
              onClick={() => void createDrafts()}
            >
              {busy
                ? "Creating drafts…"
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
            Sample merge uses{" "}
            {selected[0]?.displayName ?? user?.displayName ?? "Alex"}.
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
