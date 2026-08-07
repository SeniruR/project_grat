/** Owner-defined placeholders detected from Canva / email HTML. */

export const MERGE_FIELD_TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/**
 * How Compose fills a placeholder.
 * recipient/sender fields = auto; shared = once for all; perRecipient = per person.
 */
export type PlaceholderSource =
  | "recipientName"
  | "recipientEmail"
  | "senderName"
  | "senderEmail"
  | "shared"
  | "perRecipient";

export type PlaceholderDef = {
  /** Token spelling as found in HTML (without braces). */
  key: string;
  /** Owner-written meaning shown on Compose. */
  label: string;
  source: PlaceholderSource;
};

export const PLACEHOLDER_SOURCES: Array<{
  value: PlaceholderSource;
  label: string;
  hint: string;
}> = [
  {
    value: "recipientName",
    label: "Recipient name",
    hint: "Auto from each selected person’s name",
  },
  {
    value: "recipientEmail",
    label: "Recipient email",
    hint: "Auto from each selected person’s email",
  },
  {
    value: "senderName",
    label: "Sender name",
    hint: "From Compose sender name (same for all)",
  },
  {
    value: "senderEmail",
    label: "Sender email",
    hint: "From Compose sender email (same for all)",
  },
  {
    value: "shared",
    label: "Shared (all recipients)",
    hint: "Composer enters one value for everyone",
  },
  {
    value: "perRecipient",
    label: "Per person",
    hint: "Composer enters a value for each recipient",
  },
];

export function placeholderSourceLabel(source: PlaceholderSource): string {
  return (
    PLACEHOLDER_SOURCES.find((s) => s.value === source)?.label ?? source
  );
}

export function isPlaceholderSource(v: unknown): v is PlaceholderSource {
  return (
    typeof v === "string" &&
    PLACEHOLDER_SOURCES.some((s) => s.value === v)
  );
}

/** Guess a sensible default from the token name (owner can change it). */
export function suggestPlaceholderSource(key: string): PlaceholderSource {
  const k = key.toLowerCase().replace(/[_.-]/g, "");
  if (isRecipientEmailToken(key)) {
    return "recipientEmail";
  }
  if (isRecipientNameToken(key)) {
    return "recipientName";
  }
  if (k === "senderemail" || k === "fromemail") return "senderEmail";
  if (k === "sendername" || k === "fromname" || k === "sender") {
    return "senderName";
  }
  if (
    k.includes("note") ||
    k.includes("message") ||
    k.includes("personal")
  ) {
    return "perRecipient";
  }
  return "shared";
}

/** Tokens that typically map to recipient name (default suggestion only). */
export function isRecipientNameToken(key: string): boolean {
  const k = key.toLowerCase().replace(/[_.-]/g, "");
  return (
    k === "name" ||
    k === "displayname" ||
    k === "recipientname" ||
    k === "firstname" ||
    k === "fullname" ||
    k === "fullname"
  );
}

export function isRecipientEmailToken(key: string): boolean {
  const k = key.toLowerCase().replace(/[_.-]/g, "");
  return (
    k === "email" ||
    k === "recipientemail" ||
    (k.endsWith("email") && k.includes("recipient"))
  );
}

export function recipientNameValueForKey(key: string, fullName: string): string {
  const name = fullName.trim();
  if (!name) return "";
  const k = key.toLowerCase().replace(/[_.-]/g, "");
  if (k === "firstname" || k === "fullname") {
    return name.split(/\s+/)[0] ?? name;
  }
  return name;
}


export type NameHonorific = {
  value: string;
  label: string;
};

/** Optional title prefixes for recipient / sender name merges (defaults). */
export const DEFAULT_NAME_HONORIFICS: NameHonorific[] = [
  { value: "Mr.", label: "Mr." },
  { value: "Mrs.", label: "Mrs." },
  { value: "Miss", label: "Miss" },
  { value: "Ms.", label: "Ms." },
  { value: "Dr.", label: "Dr." },
  { value: "Sir", label: "Sir" },
  { value: "Madam", label: "Madam" },
];

/** @deprecated Prefer DEFAULT_NAME_HONORIFICS / API settings */
export const NAME_HONORIFICS = DEFAULT_NAME_HONORIFICS;

/** Prefix a display name with Mr./Mrs./… when a title is chosen. */
export function withHonorific(
  title: string | null | undefined,
  name: string,
): string {
  const n = name.trim();
  const t = (title ?? "").trim();
  if (!n) return "";
  if (!t) return n;
  const lower = n.toLowerCase();
  if (lower.startsWith(`${t.toLowerCase()} `)) return n;
  return `${t} ${n}`;
}

function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function humanizePlaceholderKey(key: string): string {
  return humanizeKey(key);
}

/** Unique token keys found in HTML (preserve first-seen spelling). */
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

export function parsePlaceholdersFromDesignJson(
  designJson: Record<string, unknown> | null | undefined,
): PlaceholderDef[] {
  const raw = designJson?.placeholders;
  if (!Array.isArray(raw)) return [];
  const out: PlaceholderDef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key.trim() : "";
    if (!key || seen.has(key.toLowerCase())) continue;
    if (!isPlaceholderSource(row.source)) continue;
    const label =
      typeof row.label === "string" && row.label.trim()
        ? row.label.trim()
        : humanizeKey(key);
    seen.add(key.toLowerCase());
    out.push({ key, label, source: row.source });
  }
  return out;
}

/** Keys the owner removed so Rescan / re-import won’t add them back. */
export function parseIgnoredPlaceholdersFromDesignJson(
  designJson: Record<string, unknown> | null | undefined,
): string[] {
  const raw = designJson?.ignoredPlaceholders;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const key = item.trim();
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    out.push(key);
  }
  return out;
}

/**
 * Build / refresh placeholder defs from detected HTML tokens.
 * Keeps owner labels + sources for keys that still exist.
 * Skips keys listed in `ignored` (owner removed them on purpose).
 */
export function syncPlaceholdersWithHtml(
  html: string,
  previous: PlaceholderDef[] = [],
  ignored: string[] = [],
): PlaceholderDef[] {
  const detected = detectMergeFields(html);
  const ignoredSet = new Set(ignored.map((k) => k.toLowerCase()));
  const prevByKey = new Map(
    previous.map((p) => [p.key.toLowerCase(), p] as const),
  );
  return detected
    .filter((key) => !ignoredSet.has(key.toLowerCase()))
    .map((key) => {
      const prev = prevByKey.get(key.toLowerCase());
      if (prev) {
        return {
          key,
          label: prev.label.trim() || humanizeKey(key),
          source: prev.source,
        };
      }
      return {
        key,
        label: humanizeKey(key),
        source: suggestPlaceholderSource(key),
      };
    });
}

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

export type MergeValueContext = {
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  senderEmail: string;
  shared: Record<string, string>;
  perRecipient: Record<string, string>;
};

/** Build token → value map from owner defs + compose values. */
export function buildMergeFieldMapFromPlaceholders(
  placeholders: PlaceholderDef[],
  ctx: MergeValueContext,
): Record<string, string> {
  const map: Record<string, string> = {};
  const name = ctx.recipientName.trim() || ctx.recipientEmail;
  const sender = ctx.senderName.trim() || ctx.senderEmail;

  for (const ph of placeholders) {
    switch (ph.source) {
      case "recipientName":
        map[ph.key] = recipientNameValueForKey(ph.key, name);
        break;
      case "recipientEmail":
        map[ph.key] = ctx.recipientEmail;
        break;
      case "senderName":
        map[ph.key] = sender;
        break;
      case "senderEmail":
        map[ph.key] = ctx.senderEmail;
        break;
      case "shared":
        map[ph.key] = (ctx.shared[ph.key] ?? "").trim();
        break;
      case "perRecipient":
        map[ph.key] = (ctx.perRecipient[ph.key] ?? "").trim();
        break;
    }
  }

  // Aliases only when the token was never defined on the template.
  const setAlias = (key: string, value: string) => {
    if (!(key in map)) map[key] = value;
  };
  setAlias("name", name);
  setAlias("displayName", name);
  setAlias("recipientName", name);
  setAlias("email", ctx.recipientEmail);
  setAlias("recipientEmail", ctx.recipientEmail);
  setAlias("senderName", sender);
  setAlias("senderEmail", ctx.senderEmail);

  return map;
}

export function sampleValueForPlaceholder(
  ph: PlaceholderDef,
  ctx: MergeValueContext,
): string {
  const map = buildMergeFieldMapFromPlaceholders([ph], ctx);
  const v = map[ph.key]?.trim() ?? "";
  return v || "—";
}

export function sharedPlaceholderKeys(placeholders: PlaceholderDef[]): string[] {
  return placeholders.filter((p) => p.source === "shared").map((p) => p.key);
}

export function perRecipientPlaceholderKeys(
  placeholders: PlaceholderDef[],
): string[] {
  return placeholders
    .filter((p) => p.source === "perRecipient")
    .map((p) => p.key);
}

/** Fallback when a template has no default subject saved. */
export const FALLBACK_DEFAULT_SUBJECT = "Thank you, {{recipientName}}";

/** Read owner-configured default email subject from designJson. */
export function parseDefaultSubjectFromDesignJson(
  designJson: Record<string, unknown> | null | undefined,
): string {
  const raw = designJson?.defaultSubject;
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 300);
}

/** Subject Compose should start with for this template. */
export function resolveTemplateDefaultSubject(
  designJson: Record<string, unknown> | null | undefined,
): string {
  return (
    parseDefaultSubjectFromDesignJson(designJson) || FALLBACK_DEFAULT_SUBJECT
  );
}
