import type { AdminAuditEvent } from "../api/client";

export type AuditCategory =
  | "auth"
  | "people"
  | "templates"
  | "categories"
  | "sends"
  | "other";

type ActionMeta = {
  label: string;
  category: AuditCategory;
};

const ACTION_META: Record<string, ActionMeta> = {
  "auth.login": { label: "Signed in", category: "auth" },
  "user.role_change": { label: "Changed user role", category: "people" },
  "user.deleted": { label: "Deleted user", category: "people" },
  "settings.name_honorifics_update": {
    label: "Updated name prefixes",
    category: "other",
  },
  "template.created": { label: "Created template", category: "templates" },
  "template.updated": { label: "Updated template", category: "templates" },
  "template.version_saved": {
    label: "Saved template version",
    category: "templates",
  },
  "template.asset_uploaded": {
    label: "Uploaded template asset",
    category: "templates",
  },
  "template.asset_deleted": {
    label: "Deleted template asset",
    category: "templates",
  },
  "template.compiled_purged": {
    label: "Purged compiled preview",
    category: "templates",
  },
  "template.preview_refreshed": {
    label: "Refreshed card preview",
    category: "templates",
  },
  "template.deleted": { label: "Deleted template", category: "templates" },
  "category.created": { label: "Created category", category: "categories" },
  "category.renamed": { label: "Renamed category", category: "categories" },
  "category.deleted": { label: "Deleted category", category: "categories" },
  "draft_job.created": { label: "Created send job", category: "sends" },
};

export const AUDIT_CATEGORIES: Array<{
  id: AuditCategory | "";
  label: string;
}> = [
  { id: "", label: "All categories" },
  { id: "auth", label: "Auth" },
  { id: "people", label: "People" },
  { id: "templates", label: "Cards" },
  { id: "categories", label: "Categories" },
  { id: "sends", label: "Sends" },
  { id: "other", label: "Other" },
];

export function auditCategory(action: string): AuditCategory {
  return ACTION_META[action]?.category ?? "other";
}

export function auditActionLabel(action: string): string {
  return ACTION_META[action]?.label ?? humanizeActionCode(action);
}

function humanizeActionCode(action: string): string {
  const last = action.split(".").pop() ?? action;
  return last.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function categoryLabel(category: AuditCategory): string {
  return (
    AUDIT_CATEGORIES.find((c) => c.id === category)?.label ?? category
  );
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/** One-line human summary for the table. */
export function auditSummary(event: AdminAuditEvent): string {
  const who = event.actor?.displayName?.trim() || "Someone";
  const p = asRecord(event.payload);
  const label = auditActionLabel(event.action);

  switch (event.action) {
    case "auth.login":
      return `${who} signed in`;
    case "user.role_change": {
      const from = str(p.from);
      const to = str(p.to);
      if (from && to) return `${who} changed a user’s role from ${from} to ${to}`;
      return `${who} changed a user’s role`;
    }
    case "user.deleted": {
      const name = str(p.displayName) || str(p.email);
      return name ? `${who} deleted ${name}` : `${who} deleted a user`;
    }
    case "template.created": {
      const name = str(p.name);
      return name ? `${who} created template “${name}”` : `${who} created a template`;
    }
    case "template.updated": {
      const name = str(p.name);
      return name ? `${who} updated template “${name}”` : `${who} updated a template`;
    }
    case "template.version_saved": {
      const version = str(p.version);
      return version
        ? `${who} saved template version v${version}`
        : `${who} saved a template version`;
    }
    case "template.asset_uploaded":
      return `${who} uploaded a template asset`;
    case "template.asset_deleted": {
      const file = str(p.fileName);
      return file
        ? `${who} deleted asset “${file}”`
        : `${who} deleted a template asset`;
    }
    case "template.compiled_purged": {
      const removed = str(p.removed);
      return removed
        ? `${who} purged ${removed} compiled file(s)`
        : `${who} purged compiled preview files`;
    }
    case "template.preview_refreshed":
      return `${who} refreshed the card preview PNG`;
    case "template.deleted": {
      const name = str(p.name);
      return name ? `${who} deleted template “${name}”` : `${who} deleted a template`;
    }
    case "category.created": {
      const name = str(p.name);
      return name ? `${who} created category “${name}”` : `${who} created a category`;
    }
    case "category.renamed": {
      const from = str(p.from);
      const to = str(p.to);
      if (from && to) return `${who} renamed category “${from}” to “${to}”`;
      return `${who} renamed a category`;
    }
    case "category.deleted": {
      const name = str(p.name);
      return name ? `${who} deleted category “${name}”` : `${who} deleted a category`;
    }
    case "draft_job.created": {
      const total = str(p.total);
      return total
        ? `${who} created a send job for ${total} recipient${total === "1" ? "" : "s"}`
        : `${who} created a send job`;
    }
    default:
      return `${who} - ${label}`;
  }
}

const DETAIL_SKIP = new Set([
  "templateId",
  "assetId",
  "categoryId",
  "id",
  "entityId",
  "compiledHtml",
  "headerHtml",
  "footerHtml",
  "designJson",
  "html",
  "sourceHtml",
  "invalidateCompiled",
]);

const DETAIL_LABELS: Record<string, string> = {
  mode: "Design type",
  email: "Email",
  from: "From",
  to: "To",
  name: "Name",
  displayName: "Name",
  role: "Role",
  visibility: "Visibility",
  status: "Status",
  version: "Card version",
  fileName: "File",
  removed: "Files removed",
  total: "Recipients",
  failed: "Failed",
  mailMode: "Sent with",
  kind: "File kind",
  mimeType: "File type",
  byteSize: "File size",
};

function looksLikeId(value: string): boolean {
  if (/^c[a-z0-9]{20,}$/i.test(value)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return true;
  }
  return false;
}

function friendlyValue(key: string, raw: unknown): string | null {
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (typeof raw === "number") {
    if (key === "byteSize") {
      if (raw < 1024) return `${raw} bytes`;
      if (raw < 1024 * 1024) return `${Math.round(raw / 1024)} KB`;
      return `${(raw / (1024 * 1024)).toFixed(1)} MB`;
    }
    return String(raw);
  }
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || looksLikeId(v)) return null;

  if (key === "visibility") {
    if (v === "PRIVATE") return "Only me";
    if (v === "SHARED") return "Shared";
  }
  if (key === "mode") {
    const modes: Record<string, string> = {
      canva_html: "Canva",
      html_import: "HTML",
      image_import: "Image",
      blank: "Blank",
    };
    return modes[v] ?? humanizeActionCode(v);
  }
  if (key === "mailMode") {
    const modes: Record<string, string> = {
      smtp: "Company email",
      graph: "Microsoft 365",
      console: "Test mode",
      dev: "Test mode",
    };
    return modes[v] ?? humanizeActionCode(v);
  }
  if (key === "mimeType") {
    if (v.includes("png")) return "PNG image";
    if (v.includes("jpeg") || v.includes("jpg")) return "JPEG image";
    if (v.includes("pdf")) return "PDF";
    if (v.includes("html")) return "HTML";
    return v;
  }
  if (key === "kind") {
    if (v === "compiled") return "Preview image";
    if (v === "source") return "Source file";
    if (v === "override") return "Replacement image";
  }
  return v;
}

/** Friendly key/value rows for the expand panel. Skips IDs and system codes. */
export function auditDetailRows(
  payload: unknown,
): Array<{ label: string; value: string }> {
  const p = asRecord(payload);
  const rows: Array<{ label: string; value: string }> = [];
  for (const [key, raw] of Object.entries(p)) {
    if (raw == null || DETAIL_SKIP.has(key)) continue;
    const value = friendlyValue(key, raw);
    if (!value) continue;
    rows.push({
      label: DETAIL_LABELS[key] ?? humanizeActionCode(key),
      value,
    });
  }
  return rows;
}

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function actionsForCategory(category: AuditCategory | ""): string[] {
  if (!category) return Object.keys(ACTION_META);
  return Object.entries(ACTION_META)
    .filter(([, meta]) => meta.category === category)
    .map(([action]) => action);
}
