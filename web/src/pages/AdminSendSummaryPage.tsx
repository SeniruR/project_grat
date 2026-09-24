import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type AdminSendSummaryCard,
  type AdminSendSummaryUser,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { roleLabel } from "../lib/roles";
import { Breadcrumbs, emailsCrumb, adminCrumb } from "../components/Breadcrumbs";
import { AdminSubNav } from "../components/AdminSubNav";
import { COMPOSE_ENABLED } from "../features";

const PAGE_SIZE = 20;

type CardPage = {
  items: AdminSendSummaryCard[];
  total: number;
  skip: number;
};

export function AdminSendSummaryPage() {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<AdminSendSummaryUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cards, setCards] = useState<CardPage | null>(null);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .adminSendSummary(token)
      .then((res) => setRows(res.users))
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Failed to load share summary",
        ),
      )
      .finally(() => setLoading(false));
  }, [token]);

  async function loadCards(userId: string, skip: number) {
    if (!token) return;
    setCardsLoading(true);
    setCardsError(null);
    try {
      const res = await api.adminSendSummaryCards(token, userId, {
        skip,
        take: PAGE_SIZE,
      });
      setCards({ items: res.items, total: res.total, skip: res.skip });
    } catch (err) {
      setCards(null);
      setCardsError(
        err instanceof Error ? err.message : "Could not load these cards",
      );
    } finally {
      setCardsLoading(false);
    }
  }

  function toggleRow(userId: string) {
    if (expandedId === userId) {
      setExpandedId(null);
      setCards(null);
      setCardsError(null);
      return;
    }
    setExpandedId(userId);
    setCards(null);
    void loadCards(userId, 0);
  }

  if (user?.role !== "ADMIN") {
    return (
      <div className="page">
        <p className="error">Admin access required.</p>
        <Link to="/">Back</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[emailsCrumb, adminCrumb, { label: "Share summary" }]}
      />
      <AdminSubNav />
      <header className="page-header" data-tour="admin-summary">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Share summary</h1>
          <p className="lede">
            What each person has shared. Open a row to see their cards, one
            page at a time.
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading summary…</p> : null}

      {!loading ? (
        <section className="panel">
          <div className="admin-people-wrap">
            <table className="audit-table admin-expand-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Shares</th>
                  <th>Cards</th>
                  <th>Last share</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No users yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const open = expandedId === row.id;
                    return (
                      <SummaryRow
                        key={row.id}
                        row={row}
                        open={open}
                        cards={open ? cards : null}
                        cardsLoading={open && cardsLoading}
                        cardsError={open ? cardsError : null}
                        onToggle={() => toggleRow(row.id)}
                        onPage={(skip) => void loadCards(row.id, skip)}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SummaryRow({
  row,
  open,
  cards,
  cardsLoading,
  cardsError,
  onToggle,
  onPage,
}: {
  row: AdminSendSummaryUser;
  open: boolean;
  cards: CardPage | null;
  cardsLoading: boolean;
  cardsError: string | null;
  onToggle: () => void;
  onPage: (skip: number) => void;
}) {
  const from = cards && cards.total > 0 ? cards.skip + 1 : 0;
  const to = cards ? Math.min(cards.skip + cards.items.length, cards.total) : 0;
  const hasPrev = Boolean(cards && cards.skip > 0);
  const hasNext = Boolean(cards && cards.skip + PAGE_SIZE < cards.total);

  return (
    <>
      <tr
        className={`admin-expand-row ${open ? "is-open" : ""}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        aria-expanded={open}
      >
        <td>
          <strong>{row.displayName}</strong>
          <div className="muted small">{row.email}</div>
        </td>
        <td>{roleLabel(row.role)}</td>
        <td>{row.jobCount}</td>
        <td>{row.messageCount}</td>
        <td>
          {row.lastSentAt ? new Date(row.lastSentAt).toLocaleString() : "-"}
        </td>
      </tr>
      {open ? (
        <tr className="admin-expand-detail">
          <td colSpan={5}>
            {cardsError ? <p className="error small">{cardsError}</p> : null}
            {cardsLoading && !cards ? (
              <p className="muted small">Loading cards…</p>
            ) : null}
            {cards && cards.total === 0 ? (
              <p className="muted small">No cards shared by this person.</p>
            ) : null}
            {cards && cards.items.length > 0 ? (
              <>
                <ul className="admin-job-list">
                  {cards.items.map((card) => (
                    <li key={card.id}>
                      <div className="admin-job-list-head">
                        <div>
                          <strong>{card.templateName}</strong>
                          <div className="muted small">
                            Given to {card.recipientName || card.recipientEmail}
                            {" · "}
                            {card.subject}
                            {" · "}
                            {new Date(card.createdAt).toLocaleString()}
                          </div>
                        </div>
                        {COMPOSE_ENABLED ? (
                          <Link
                            className="small"
                            to={`/drafts/${card.jobId}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open share
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="admin-share-page">
                  <p className="muted small">
                    {from}–{to} of {cards.total}
                  </p>
                  <div className="admin-share-page-actions">
                    <button
                      type="button"
                      className="ghost"
                      disabled={!hasPrev || cardsLoading}
                      onClick={() => onPage(Math.max(0, cards.skip - PAGE_SIZE))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={!hasNext || cardsLoading}
                      onClick={() => onPage(cards.skip + PAGE_SIZE)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}
