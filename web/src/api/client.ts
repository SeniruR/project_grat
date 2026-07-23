const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type ApiUser = {
  id: string;
  aadOid: string;
  email: string;
  displayName: string;
  role: "USER" | "ADMIN";
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
  versions: Array<{
    id: string;
    version: number;
    designJson: Record<string, unknown>;
    compiledHtml: string | null;
    previewUrl: string | null;
    createdAt: string;
  }>;
  _count?: { assets: number };
  assets?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    storageKey: string;
    kind?: string;
  }>;
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
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    method,
    headers: {
      ...authHeaders(token, hasBody && method !== "DELETE"),
      ...(init.headers ?? {}),
    },
  });

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
    }>("/auth/mode"),

  devLogin: (body: {
    email: string;
    displayName: string;
    role?: "USER" | "ADMIN";
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
      mode: "blank" | "html_import" | "designer";
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
      headerHtml?: string | null;
      footerHtml?: string | null;
    },
  ) =>
    request<{ template: TemplateSummary }>(`/templates/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),

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
    kind: "source" | "compiled" = "source",
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

  adminStats: (token: string) =>
    request<{
      users: number;
      templates: number;
      drafts: number;
      audits: number;
    }>("/admin/stats", { token }),

  adminAudit: (token: string) =>
    request<{
      events: Array<{
        id: string;
        action: string;
        entityType: string;
        createdAt: string;
        actor: { displayName: string; email: string } | null;
      }>;
    }>("/admin/audit", { token }),
};

export function assetUrl(storageKey: string) {
  return `${API_URL}/uploads/${storageKey.replace(/\\/g, "/")}`;
}
