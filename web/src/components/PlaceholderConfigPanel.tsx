import {
  PLACEHOLDER_SOURCES,
  type PlaceholderDef,
  type PlaceholderSource,
} from "../lib/mergeFields";

type Props = {
  placeholders: PlaceholderDef[];
  canEdit: boolean;
  saving?: boolean;
  onChange: (next: PlaceholderDef[]) => void;
  /** Keys removed by the owner (skipped on Rescan). */
  ignoredKeys?: string[];
  onIgnoredChange?: (next: string[]) => void;
  /** Restore a removed key and re-sync from HTML (parent should update ignored + placeholders). */
  onRestoreIgnored?: (key: string) => void;
  /** When false, hide Save / Rescan (parent form handles save). */
  showActions?: boolean;
  onSave?: () => void;
  onRescan?: () => void;
  title?: string;
  description?: string;
};

/**
 * Template owner defines what each detected {{placeholder}} means and how
 * Compose should fill it.
 */
export function PlaceholderConfigPanel({
  placeholders,
  canEdit,
  saving = false,
  onChange,
  ignoredKeys = [],
  onIgnoredChange,
  onRestoreIgnored,
  showActions = true,
  onSave,
  onRescan,
  title = "Placeholders",
  description,
}: Props) {
  function updateRow(
    index: number,
    patch: Partial<Pick<PlaceholderDef, "label" | "source">>,
  ) {
    onChange(
      placeholders.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(index: number) {
    const removed = placeholders[index];
    if (!removed) return;
    onChange(placeholders.filter((_, i) => i !== index));
    if (onIgnoredChange) {
      const key = removed.key.trim();
      if (!key) return;
      const lower = key.toLowerCase();
      if (ignoredKeys.some((k) => k.toLowerCase() === lower)) return;
      onIgnoredChange([...ignoredKeys, key]);
    }
  }

  function restoreIgnored(key: string) {
    if (onRestoreIgnored) {
      onRestoreIgnored(key);
      return;
    }
    if (!onIgnoredChange) return;
    const lower = key.toLowerCase();
    onIgnoredChange(ignoredKeys.filter((k) => k.toLowerCase() !== lower));
  }

  const blurb =
    description ??
    `Type any {{token}} in Canva, then define each token here. Compose uses these definitions for that send only — the HTML template is not overwritten when filling values. Remove a row if it was detected by mistake.`;

  const Wrapper = showActions ? "section" : "div";
  const wrapperClass = showActions
    ? "panel placeholder-config"
    : "placeholder-config is-embedded";

  return (
    <Wrapper className={wrapperClass}>
      <h2>{title}</h2>
      <p className="muted small">{blurb}</p>

      {placeholders.length === 0 ? (
        <p className="muted">
          No placeholders found in the email HTML. Add text like{" "}
          <code>{"{{recipientName}}"}</code> or <code>{"{{eventTitle}}"}</code>{" "}
          in Canva and re-import the ZIP
          {showActions ? ", or click Rescan after replacing the design" : ""}.
        </p>
      ) : (
        <div className="merge-guide-table-wrap">
          <table className="merge-guide-table placeholder-config-table">
            <thead>
              <tr>
                <th>Placeholder</th>
                <th>Meaning (label)</th>
                <th>Filled how</th>
                {canEdit ? <th className="placeholder-col-actions"> </th> : null}
              </tr>
            </thead>
            <tbody>
              {placeholders.map((ph, index) => (
                <tr key={ph.key.toLowerCase()}>
                  <td>
                    <code>{`{{${ph.key}}}`}</code>
                  </td>
                  <td>
                    {canEdit ? (
                      <input
                        value={ph.label}
                        onChange={(e) =>
                          updateRow(index, { label: e.target.value })
                        }
                        disabled={saving}
                        maxLength={120}
                        aria-label={`Label for ${ph.key}`}
                      />
                    ) : (
                      ph.label
                    )}
                  </td>
                  <td>
                    {canEdit ? (
                      <select
                        value={ph.source}
                        onChange={(e) =>
                          updateRow(index, {
                            source: e.target.value as PlaceholderSource,
                          })
                        }
                        disabled={saving}
                        aria-label={`Source for ${ph.key}`}
                      >
                        {PLACEHOLDER_SOURCES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      PLACEHOLDER_SOURCES.find((s) => s.value === ph.source)
                        ?.label ?? ph.source
                    )}
                    <span className="muted small merge-alias">
                      {
                        PLACEHOLDER_SOURCES.find((s) => s.value === ph.source)
                          ?.hint
                      }
                    </span>
                  </td>
                  {canEdit ? (
                    <td className="placeholder-col-actions">
                      <button
                        type="button"
                        className="ghost danger-text placeholder-remove"
                        disabled={saving}
                        onClick={() => removeRow(index)}
                        aria-label={`Remove {{${ph.key}}}`}
                        title="Remove — won’t be asked for on Compose"
                      >
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && ignoredKeys.length > 0 ? (
        <div className="placeholder-ignored">
          <p className="muted small">
            Removed (skipped on Rescan). Restore if you still need them in
            Compose:
          </p>
          <ul className="placeholder-ignored-list">
            {ignoredKeys.map((key) => (
              <li key={key.toLowerCase()}>
                <code>{`{{${key}}}`}</code>
                {onRestoreIgnored || onIgnoredChange ? (
                  <button
                    type="button"
                    className="ghost small"
                    disabled={saving}
                    onClick={() => restoreIgnored(key)}
                  >
                    Restore
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canEdit && showActions && onSave && onRescan ? (
        <div className="surface-actions">
          <button type="button" disabled={saving} onClick={onSave}>
            {saving ? "Saving…" : "Save placeholder definitions"}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={saving}
            onClick={onRescan}
          >
            Rescan HTML
          </button>
        </div>
      ) : null}
    </Wrapper>
  );
}
