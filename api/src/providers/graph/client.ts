import { config } from "../../config.js";

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

let cached: CachedToken | null = null;

export function assertGraphMailConfig() {
  const missing: string[] = [];
  if (!config.azureTenantId) missing.push("AZURE_TENANT_ID");
  if (!config.azureClientId) missing.push("AZURE_CLIENT_ID");
  if (!config.azureClientSecret) missing.push("AZURE_CLIENT_SECRET");
  if (missing.length) {
    throw new Error(
      `MAIL_MODE=graph requires ${missing.join(", ")}. Keep MAIL_MODE=mock until Azure app registration is configured.`,
    );
  }
}

/** App-only token (client credentials) for Graph Mail.ReadWrite. */
export async function getGraphAppToken(): Promise<string> {
  assertGraphMailConfig();

  const now = Date.now();
  if (cached && cached.expiresAtMs > now + 60_000) {
    return cached.accessToken;
  }

  const url = `https://login.microsoftonline.com/${config.azureTenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.azureClientId!,
    client_secret: config.azureClientSecret!,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Azure token request failed (${res.status})`,
    );
  }

  const expiresInSec = Number(json.expires_in ?? 3600);
  cached = {
    accessToken: json.access_token,
    expiresAtMs: now + expiresInSec * 1000,
  };
  return cached.accessToken;
}

export async function graphFetch<T>(
  path: string,
  options: {
    method?: string;
    accessToken: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<T> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  if (!res.ok) {
    const err = json as {
      error?: { message?: string; code?: string };
    } | null;
    throw new Error(
      err?.error?.message ||
        err?.error?.code ||
        `Graph request failed (${res.status}) ${path}`,
    );
  }

  return json as T;
}
