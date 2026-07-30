/** Shared merge-field helpers for Canva HTML personalization. */

export const MERGE_FIELD_TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Canonical tokens we document and fill at compose/send time. */
export const KNOWN_MERGE_FIELDS = [
  {
    key: "recipientName",
    aliases: ["name", "displayName"],
    label: "Recipient name",
    example: "{{recipientName}}",
  },
  {
    key: "recipientEmail",
    aliases: ["email"],
    label: "Recipient email",
    example: "{{recipientEmail}}",
  },
  {
    key: "senderName",
    aliases: [],
    label: "Sender name",
    example: "{{senderName}}",
  },
  {
    key: "senderEmail",
    aliases: [],
    label: "Sender email",
    example: "{{senderEmail}}",
  },
] as const;

export type MergeFieldValues = {
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  senderEmail: string;
};

/** Replace {{field}} tokens (case-insensitive keys). Unknown tokens left as-is. */
export function applyMergeFields(
  html: string,
  fields: Record<string, string>,
) {
  const map = new Map(
    Object.entries(fields).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return html.replace(MERGE_FIELD_TOKEN_RE, (full, key: string) => {
    const value = map.get(key.toLowerCase());
    return value != null ? value : full;
  });
}

/** Build the full alias map used for recipient + sender personalization. */
export function buildMergeFieldMap(values: MergeFieldValues): Record<string, string> {
  const name = values.recipientName.trim() || values.recipientEmail;
  const sender = values.senderName.trim() || values.senderEmail;
  return {
    name,
    displayName: name,
    recipientName: name,
    email: values.recipientEmail,
    recipientEmail: values.recipientEmail,
    senderName: sender,
    senderEmail: values.senderEmail,
  };
}

/** Unique token keys found in HTML (lowercased original spelling preserved via first hit). */
export function detectMergeFields(html: string): string[] {
  const found = new Map<string, string>();
  const re = new RegExp(MERGE_FIELD_TOKEN_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1];
    const lower = raw.toLowerCase();
    if (!found.has(lower)) found.set(lower, raw);
  }
  return [...found.values()];
}

export function describeMergeField(key: string): string {
  const lower = key.toLowerCase();
  for (const field of KNOWN_MERGE_FIELDS) {
    if (
      field.key.toLowerCase() === lower ||
      field.aliases.some((a) => a.toLowerCase() === lower)
    ) {
      return field.label;
    }
  }
  return key;
}
