import {
  IMAGE_SLOT_MODES,
  imageSlotThumbSrc,
  type ImageSlotDef,
  type ImageSlotMode,
} from "../lib/imageSlots";

type Props = {
  slots: ImageSlotDef[];
  canEdit: boolean;
  saving?: boolean;
  onChange: (next: ImageSlotDef[]) => void;
  showActions?: boolean;
  onSave?: () => void;
  onRescan?: () => void;
  title?: string;
  description?: string;
};

/**
 * Template owner marks which images Compose may replace, and whether
 * replacements are shared or per recipient.
 */
export function ImageSlotConfigPanel({
  slots,
  canEdit,
  saving = false,
  onChange,
  showActions = true,
  onSave,
  onRescan,
  title = "Image slots",
  description,
}: Props) {
  function updateRow(
    index: number,
    patch: Partial<Pick<ImageSlotDef, "label" | "mode">>,
  ) {
    onChange(slots.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  const blurb =
    description ??
    `Images detected in the email HTML. Mark slots as shared or per-person so Compose can swap pictures without moving layout. Fixed slots keep the template image.`;

  const Wrapper = showActions ? "section" : "div";
  const wrapperClass = showActions
    ? "panel placeholder-config image-slot-config"
    : "placeholder-config image-slot-config is-embedded";

  return (
    <Wrapper className={wrapperClass}>
      <h2>{title}</h2>
      <p className="muted small">{blurb}</p>

      {slots.length === 0 ? (
        <p className="muted">
          No content images found in the email HTML. Re-import a Canva ZIP with
          images
          {showActions ? ", or click Rescan after replacing the design" : ""}.
        </p>
      ) : (
        <div className="merge-guide-table-wrap">
          <table className="merge-guide-table placeholder-config-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Label</th>
                <th>Size</th>
                <th>Replace how</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((slot, index) => {
                const thumb = imageSlotThumbSrc(slot);
                return (
                  <tr key={slot.id}>
                    <td>
                      <div className="image-slot-thumb-row">
                        {thumb ? (
                          <img
                            className="image-slot-thumb"
                            src={thumb}
                            alt=""
                          />
                        ) : null}
                        <code className="image-slot-id">{slot.id}</code>
                      </div>
                    </td>
                    <td>
                      {canEdit ? (
                        <input
                          value={slot.label}
                          onChange={(e) =>
                            updateRow(index, { label: e.target.value })
                          }
                          disabled={saving}
                          maxLength={120}
                          aria-label={`Label for ${slot.id}`}
                        />
                      ) : (
                        slot.label
                      )}
                    </td>
                    <td className="muted small">
                      {slot.designedWidth}×{slot.designedHeight}
                    </td>
                    <td>
                      {canEdit ? (
                        <select
                          value={slot.mode}
                          onChange={(e) =>
                            updateRow(index, {
                              mode: e.target.value as ImageSlotMode,
                            })
                          }
                          disabled={saving}
                          aria-label={`Mode for ${slot.id}`}
                        >
                          {IMAGE_SLOT_MODES.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        IMAGE_SLOT_MODES.find((m) => m.value === slot.mode)
                          ?.label ?? slot.mode
                      )}
                      <span className="muted small merge-alias">
                        {
                          IMAGE_SLOT_MODES.find((m) => m.value === slot.mode)
                            ?.hint
                        }
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && showActions && onSave && onRescan ? (
        <div className="surface-actions">
          <button type="button" disabled={saving} onClick={onSave}>
            {saving ? "Saving…" : "Save image slot settings"}
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
