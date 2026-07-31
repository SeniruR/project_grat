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

  const blurb =
    description ??
    `Type any {{token}} in Canva, then define each token here. Compose uses these definitions for that send only — the HTML template is not overwritten when filling values.`;

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
