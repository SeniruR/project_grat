/**
 * Explains freeform Canva placeholders — owners invent tokens, then define them
 * after import.
 */
export function MergeFieldsGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`merge-fields-guide ${compact ? "is-compact" : ""}`}>
      <h3 className="card-section-title">Your own placeholders</h3>
      <p className="muted small">
        In Canva, type any token as normal text using double braces — e.g.{" "}
        <code>{"{{heroName}}"}</code>, <code>{"{{eventTitle}}"}</code>,{" "}
        <code>{"{{shipDate}}"}</code>. After you import the ZIP, define each
        placeholder on the card (meaning + whether it comes from the recipient,
        is shared for everyone, or is filled per person). Compose only fills
        values for that send; the saved template stays unchanged.
      </p>
      {!compact ? (
        <ul className="steps-list muted small">
          <li>
            <strong>Recipient name / email</strong> — auto from selected people
          </li>
          <li>
            <strong>Sender name / email</strong> — from Compose sender fields
          </li>
          <li>
            <strong>Shared</strong> — one value for all (date, venue, event name)
          </li>
          <li>
            <strong>Per person</strong> — different value for each recipient
          </li>
        </ul>
      ) : null}
    </div>
  );
}
