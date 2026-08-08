import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type SentItem } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { isAdmin } from "../lib/roles";
import { SentPreviewModal } from "../components/SentPreviewModal";
import { Breadcrumbs, emailsCrumb } from "../components/Breadcrumbs";

export function SentPage() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<SentItem[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<SentItem | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload(search = q) {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.sentHistory(token, search);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sent mail");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          emailsCrumb,
          { label: "Sent" },
        ]}
      />
      <header className="page-header">
        <div>
          <p className="eyebrow">Cards</p>
          <h1>Sent</h1>
          <p className="lede">
            What you sent, to whom, and when
            {isAdmin(user) ? " (admins see everyone’s sends)" : ""}. Click a
            row to open a full preview.
          </p>
        </div>
      </header>

      <div className="marketplace-toolbar sent-toolbar">
        <label className="marketplace-search">
          <span className="visually-hidden">Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void reload(q);
            }}
            placeholder="Search subject, recipient, or card…"
          />
        </label>
        <button type="button" className="sent-search-btn" onClick={() => void reload(q)}>
          Search
        </button>
        <Link className="ghost small" to="/drafts">
          View by job
        </Link>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading…</p> : null}

      {!loading && items.length === 0 ? (
        <p className="muted">
          No sends yet. Pick a card from Browse cards and send it.
        </p>
      ) : (
        <ul className="sent-list">
          {items.map((item) => (
            <li key={item.id} className="sent-row">
              <button
                type="button"
                className="sent-row-head"
                onClick={() => setPreviewItem(item)}
              >
                <div>
                  <strong>{item.subject}</strong>
                    <span className="meta">
                      {item.job.template.name}
                      {item.job.categoryName
                        ? ` · ${item.job.categoryName}`
                        : ""}{" "}
                      → {item.recipientName || item.recipientEmail} ·{" "}
                      {item.status}
                      {isAdmin(user)
                        ? ` · by ${item.job.requester.displayName}`
                        : ""}
                    </span>
                </div>
                <span className="muted small">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {previewItem ? (
        <SentPreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
        />
      ) : null}
    </div>
  );
}
