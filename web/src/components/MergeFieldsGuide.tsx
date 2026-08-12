/**
 * Short reminder for inventing Canva placeholders.
 */
export function MergeFieldsGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`merge-fields-guide ${compact ? "is-compact" : ""}`}>
      <h3 className="card-section-title">Placeholders</h3>
      <p className="muted small">
        In Canva text, type tags like <code>{"{{recipientName}}"}</code> or{" "}
        <code>{"{{eventTitle}}"}</code>. After import, define each tag on the
        card so Compose can fill them when sending.
      </p>
      {!compact ? (
        <ul className="steps-list muted small">
          <li>
            <strong>Recipient name / email</strong> - from selected people
          </li>
          <li>
            <strong>Sender name / email</strong> - from Compose sender fields
          </li>
          <li>
            <strong>Shared</strong> - one value for everyone
          </li>
          <li>
            <strong>Per person</strong> - different value per recipient
          </li>
        </ul>
      ) : null}
    </div>
  );
}
