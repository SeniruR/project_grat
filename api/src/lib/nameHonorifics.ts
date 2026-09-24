export type NameHonorific = {
  value: string;
  label: string;
  /** When false, the card uses the title alone (Dear Sir,). Default true. */
  withName: boolean;
};

export const NAME_HONORIFICS_SETTING_KEY = "name_honorifics";

export const DEFAULT_NAME_HONORIFICS: NameHonorific[] = [
  { value: "Mr.", label: "Mr.", withName: true },
  { value: "Mrs.", label: "Mrs.", withName: true },
  { value: "Miss", label: "Miss", withName: true },
  { value: "Ms.", label: "Ms.", withName: true },
  { value: "Dr.", label: "Dr.", withName: true },
  { value: "Sir", label: "Sir", withName: false },
  { value: "Madam", label: "Madam", withName: false },
];

/** Titles that stand in for the name when an older list has no withName flag. */
function legacyTitleOnly(value: string): boolean {
  return /^(sir|madam)\.?$/i.test(value.trim());
}

/** Normalize admin-edited prefix list; drops empties and duplicates. */
export function normalizeNameHonorifics(raw: unknown): NameHonorific[] {
  if (!Array.isArray(raw)) return [...DEFAULT_NAME_HONORIFICS];
  const out: NameHonorific[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const value =
      typeof row.value === "string"
        ? row.value.trim()
        : typeof row.label === "string"
          ? row.label.trim()
          : "";
    if (!value || value.length > 40) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const label =
      typeof row.label === "string" && row.label.trim()
        ? row.label.trim().slice(0, 40)
        : value;
    const withName =
      typeof row.withName === "boolean" ? row.withName : !legacyTitleOnly(value);
    out.push({ value, label, withName });
    if (out.length >= 40) break;
  }
  return out.length > 0 ? out : [...DEFAULT_NAME_HONORIFICS];
}
