const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type ApiUser = {
  id: string;
  aadOid: string;
  email: string;
  displayName: string;
  role: "USER" | "DESIGNER" | "ADMIN";
};

export type MarketplaceCard = TemplateSummary & {
  isFavorite?: boolean;
  favoritedAt?: string;
};

export type AdminAuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: unknown;
  createdAt: string;
  actor: {
    id: string;
    displayName: string;
    email: string;
    role?: string;
  } | null;
};

export type AdminSendSummaryMessage = {
  id: string;
  subject: string;
  recipientName: string | null;
  recipientEmail: string;
  status: string;
  createdAt: string;
};

export type AdminSendSummaryJob = {
  id: string;
  status: string;
  total: number;
  completed: number;
  messageCount: number;
  templateName: string;
  categoryName: string | null;
  createdAt: string;
  messages?: AdminSendSummaryMessage[];
};

export type AdminSendSummaryUser = {
  id: string;
  email: string;
  displayName: string;
  role: "USER" | "DESIGNER" | "ADMIN";
  jobCount: number;
  messageCount: number;
  lastSentAt: string | null;
  recentJobs: AdminSendSummaryJob[];
  recentTemplates: string[];
};

export type SentItem = {
  id: string;
  recipientOid: string | null;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  bodyHtml: string | null;
  graphMessageId: string | null;
  status: string;
  error: string | null;
  createdAt: string;
  job: {
    id: string;
    status: string;
    createdAt: string;
    categoryName?: string | null;
    template: { id: string; name: string };
    requester: { id: string; displayName: string; email: string };
  };
};

export type TemplateCategory = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: { id: string; displayName: string; email: string } | null;
  _count?: { templates: number; shared?: number };
};

export type TemplateSummary = {
  id: string;
  name: string;
  visibility: "PRIVATE" | "SHARED";
  status: "DRAFT" | "PUBLISHED";
  catalogType: string;
  headerHtml: string | null;
  footerHtml: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; displayName: string; email: string };
  category?: { id: string; name: string } | null;
  versions: Array<{
    id: string;
    version: number;
    designJson: Record<string, unknown>;
    compiledHtml: string | null;
    previewUrl: string | null;
    createdAt: string;
  }>;
  _count?: { assets: number };
  /** Distinct senders who used this template (all time). */
  usageTotalUsers?: number;
  /** Distinct senders who used it since the last template edit. */
  usageSinceLastEdit?: number;
  assets?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    storageKey: string;
    kind?: string;
  }>;
};

export type DirectoryPerson = {
  aadOid: string;
  email: string;
  displayName: string;
};

export type OutboundDraft = {
  id: string;
  recipientOid: string | null;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  bodyHtml: string | null;
  graphMessageId: string | null;
  status: string;
  error: string | null;
  createdAt: string;
};

export type DraftJobDetail = {
  id: string;
  status: string;
  total: number;
  completed: number;
  createdAt: string;
  updatedAt: string;
  template: { id: string; name: string };
  templateVersion: { id: string; version: number };
  requester: { id: string; displayName: string; email: string };
  drafts: OutboundDraft[];
};

export type DraftJobSummary = {
  id: string;
  status: string;
  total: number;
  completed: number;
  createdAt: string;
  template: { id: string; name: string };
  templateVersion: { id: string; version: number };
  _count: { drafts: number };
};

function authHeaders(
  token?: string | null,
  withJsonContentType = false,
): HeadersInit {
  const headers: Record<string, string> = {};
  if (withJsonContentType) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, ...init } = options;
  const method = (init.method ?? "GET").toUpperCase();
  const hasBody = init.body != null && init.body !== "";
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      method,
      headers: {
        ...authHeaders(token, hasBody && method !== "DELETE"),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error(
      `Cannot reach API at ${API_URL}. Is the API running? (npm run dev from project root)`,
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      typeof body.error === "string"
        ? body.error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  getMode: () =>
    request<{
      authMode: string;
      directoryMode: string;
      mailMode: string;
      smtpFrom?: string | null;
      smtpFromName?: string | null;
    }>("/auth/mode"),

  devLogin: (body: {
    email: string;
    displayName: string;
    role?: "USER" | "DESIGNER" | "ADMIN";
  }) =>
    request<{ token: string; user: ApiUser }>("/auth/dev-login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: (token: string) => request<{ user: ApiUser }>("/auth/me", { token }),

  catalog: (token: string) =>
    request<{
      items: Array<{
        type: string;
        title: string;
        description: string;
        available: boolean;
      }>;
    }>("/catalog", { token }),

  templates: (token: string) =>
    request<{ templates: TemplateSummary[] }>("/templates", { token }),

  template: (token: string, id: string) =>
    request<{ template: TemplateSummary }>(`/templates/${id}`, { token }),

  createTemplate: (
    token: string,
    body: {
      name: string;
      visibility: "PRIVATE" | "SHARED";
      categoryId?: string;
      mode: "blank" | "html_import" | "canva_html" | "image_import";
      html?: string;
      headerHtml?: string;
      footerHtml?: string;
    },
  ) =>
    request<{ template: TemplateSummary }>("/templates", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  updateTemplate: (
    token: string,
    id: string,
    body: {
      name?: string;
      visibility?: "PRIVATE" | "SHARED";
      status?: "DRAFT" | "PUBLISHED";
      categoryId?: string | null;
      headerHtml?: string | null;
      footerHtml?: string | null;
    },
  ) =>
    request<{ template: TemplateSummary }>(`/templates/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),

  categories: (token: string, q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return request<{ categories: TemplateCategory[] }>(`/categories${qs}`, {
      token,
    });
  },

  createCategory: (token: string, name: string) =>
    request<{ category: TemplateCategory; created: boolean }>("/categories", {
      method: "POST",
      token,
      body: JSON.stringify({ name }),
    }),

  renameCategory: (token: string, id: string, name: string) =>
    request<{ category: TemplateCategory }>(`/categories/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ name }),
    }),

  deleteCategory: (token: string, id: string) =>
    request<void>(`/categories/${id}`, { method: "DELETE", token }),

  saveTemplateVersion: (
    token: string,
    id: string,
    body: {
      designJson?: Record<string, unknown>;
      compiledHtml?: string | null;
      previewUrl?: string | null;
    },
  ) =>
    request<{ version: { id: string; version: number } }>(
      `/templates/${id}/versions`,
      {
        method: "POST",
        token,
        body: JSON.stringify(body),
      },
    ),

  /** Update PNG thumb on the current version without bumping edited time. */
  patchTemplatePreview: (token: string, id: string, previewUrl: string) =>
    request<{
      version: {
        id: string;
        version: number;
        previewUrl: string | null;
        createdAt: string;
      };
    }>(`/templates/${id}/preview`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ previewUrl }),
    }),

  deleteTemplate: (token: string, id: string) =>
    request<void>(`/templates/${id}`, { method: "DELETE", token }),

  deleteTemplateAsset: (
    token: string,
    templateId: string,
    assetId: string,
    opts?: { invalidateCompiled?: boolean },
  ) => {
    const q = opts?.invalidateCompiled ? "?invalidateCompiled=1" : "";
    return request<void>(`/templates/${templateId}/assets/${assetId}${q}`, {
      method: "DELETE",
      token,
    });
  },

  purgeCompiledAssets: (token: string, templateId: string) =>
    request<{ removed: number }>(
      `/templates/${templateId}/assets/purge-compiled`,
      { method: "POST", token },
    ),

  uploadTemplateAsset: async (
    token: string,
    id: string,
    file: File,
    kind: "source" | "compiled" | "override" = "source",
  ) => {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    const res = await fetch(`${API_URL}/templates/${id}/assets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Upload failed (${res.status})`);
    }
    return res.json() as Promise<{
      asset: {
        id: string;
        fileName: string;
        mimeType: string;
        byteSize: number;
        storageKey: string;
        kind: string;
        url: string;
        suggestedHtml?: string;
      };
    }>;
  },

  directorySearch: (token: string, q: string) =>
    request<{
      mode: string;
      people: Array<{ aadOid: string; email: string; displayName: string }>;
    }>(`/directory/search?q=${encodeURIComponent(q)}`, { token }),

  createDraftJob: (
    token: string,
    body: {
      templateId: string;
      templateVersionId?: string;
      subject: string;
      recipients: Array<{
        aadOid?: string;
        email: string;
        displayName?: string;
        fields?: Record<string, string>;
        imageSlots?: Record<string, string>;
      }>;
      senderName?: string;
      senderEmail?: string;
      sharedFields?: Record<string, string>;
      sharedImageSlots?: Record<string, string>;
      extraPlaceholders?: Array<{
        key: string;
        label: string;
        source:
          | "recipientName"
          | "recipientEmail"
          | "senderName"
          | "senderEmail"
          | "shared"
          | "perRecipient";
      }>;
    },
  ) =>
    request<{ job: DraftJobDetail; mailMode: string }>("/draft-jobs", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  draftJob: (token: string, id: string) =>
    request<{ job: DraftJobDetail; mailMode: string }>(`/draft-jobs/${id}`, {
      token,
    }),

  draftJobs: (token: string) =>
    request<{
      jobs: DraftJobSummary[];
      mailMode: string;
    }>("/draft-jobs", { token }),

  sentHistory: (token: string, q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return request<{ items: SentItem[]; mailMode: string }>(`/sent${qs}`, {
      token,
    });
  },

  marketplace: (
    token: string,
    opts?: { q?: string; favorites?: boolean; categoryId?: string | null },
  ) => {
    const params = new URLSearchParams();
    if (opts?.q?.trim()) params.set("q", opts.q.trim());
    if (opts?.favorites) params.set("favorites", "1");
    if (opts?.categoryId) params.set("categoryId", opts.categoryId);
    const qs = params.toString() ? `?${params}` : "";
    return request<{ templates: MarketplaceCard[] }>(`/marketplace${qs}`, {
      token,
    });
  },

  marketplaceCard: (token: string, id: string) =>
    request<{
      template: MarketplaceCard;
      previewHtml: string | null;
      previewUrl: string | null;
    }>(`/marketplace/${id}`, { token }),

  favorites: (token: string) =>
    request<{ templates: MarketplaceCard[] }>("/favorites", { token }),

  addFavorite: (token: string, templateId: string) =>
    request<{ ok: boolean; isFavorite: boolean }>(`/favorites/${templateId}`, {
      method: "POST",
      token,
    }),

  removeFavorite: (token: string, templateId: string) =>
    request<{ ok: boolean; isFavorite: boolean }>(`/favorites/${templateId}`, {
      method: "DELETE",
      token,
    }),

  adminStats: (token: string) =>
    request<{
      users: number;
      templates: number;
      drafts: number;
      audits: number;
      designers?: number;
    }>("/admin/stats", { token }),

  adminSendSummary: (token: string) =>
    request<{ users: AdminSendSummaryUser[] }>("/admin/send-summary", {
      token,
    }),

  adminAudit: (
    token: string,
    opts?: { q?: string; action?: string; take?: number },
  ) => {
    const params = new URLSearchParams();
    if (opts?.q?.trim()) params.set("q", opts.q.trim());
    if (opts?.action?.trim()) params.set("action", opts.action.trim());
    if (opts?.take) params.set("take", String(opts.take));
    const qs = params.toString() ? `?${params}` : "";
    return request<{ events: AdminAuditEvent[] }>(`/admin/audit${qs}`, {
      token,
    });
  },

  adminUsers: (token: string) =>
    request<{
      users: Array<{
        id: string;
        email: string;
        displayName: string;
        role: "USER" | "DESIGNER" | "ADMIN";
        isDirectory: boolean;
        createdAt: string;
        _count: { ownedTemplates: number; draftJobs: number };
      }>;
    }>("/admin/users", { token }),

  adminUpdateUser: (
    token: string,
    id: string,
    body: { role: "USER" | "DESIGNER" | "ADMIN" },
  ) =>
    request<{
      user: {
        id: string;
        email: string;
        displayName: string;
        role: "USER" | "DESIGNER" | "ADMIN";
        isDirectory: boolean;
        createdAt: string;
        _count: { ownedTemplates: number; draftJobs: number };
      };
    }>(`/admin/users/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),

  adminDeleteUser: (token: string, id: string) =>
    request<void>(`/admin/users/${id}`, { method: "DELETE", token }),

  nameHonorifics: (token: string) =>
    request<{ honorifics: Array<{ value: string; label: string }> }>(
      "/settings/name-honorifics",
      { token },
    ),

  adminNameHonorifics: (token: string) =>
    request<{ honorifics: Array<{ value: string; label: string }> }>(
      "/admin/settings/name-honorifics",
      { token },
    ),

  adminUpdateNameHonorifics: (
    token: string,
    honorifics: Array<{ value: string; label: string }>,
  ) =>
    request<{ honorifics: Array<{ value: string; label: string }> }>(
      "/admin/settings/name-honorifics",
      {
        method: "PUT",
        token,
        body: JSON.stringify({ honorifics }),
      },
    ),
};

export function assetUrl(storageKey: string) {
  return `${API_URL}/uploads/${storageKey.replace(/\\/g, "/")}`;
}
