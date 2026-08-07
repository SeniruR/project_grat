export type NameHonorific = {
  value: string;
  label: string;
};

export const NAME_HONORIFICS_SETTING_KEY = "name_honorifics";

export const DEFAULT_NAME_HONORIFICS: NameHonorific[] = [
  { value: "Mr.", label: "Mr." },
  { value: "Mrs.", label: "Mrs." },
  { value: "Miss", label: "Miss" },
  { value: "Ms.", label: "Ms." },
  { value: "Dr.", label: "Dr." },
  { value: "Sir", label: "Sir" },
  { value: "Madam", label: "Madam" },
];

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
    out.push({ value, label });
    if (out.length >= 40) break;
  }
  return out.length > 0 ? out : [...DEFAULT_NAME_HONORIFICS];
}
