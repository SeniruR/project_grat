import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../../config.js";

/** Delegated scopes for sign-in, company directory search, and send-as-user. */
export const AZURE_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "User.ReadBasic.All",
  "Mail.Send",
].join(" ");

export class AzureNotConfigured extends Error {
  constructor() {
    super(
      "Azure AD is not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET in api/.env, then restart the API.",
    );
    this.name = "AzureNotConfigured";
  }
}

export function assertAzureConfigured() {
  if (!config.azureReady) throw new AzureNotConfigured();
}

type AzureTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export type AzureProfile = {
  oid: string;
  email: string;
  displayName: string;
  employeeId: string | null;
};

function authority() {
  return `https://login.microsoftonline.com/${config.azureTenantId}/oauth2/v2.0`;
}

function signState(payload: string) {
  const sig = createHmac("sha256", config.jwtSecret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

function verifyState(state: string): { cv: string; exp: number } {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) throw new Error("Sign-in session expired. Start again.");
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac("sha256", config.jwtSecret)
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Sign-in session was rejected. Start again.");
  }
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    cv?: string;
    exp?: number;
  };
  if (!data.cv || !data.exp || data.exp < Date.now()) {
    throw new Error("Sign-in session expired. Start again.");
  }
  return { cv: data.cv, exp: data.exp };
}

export function azureAuthorizeUrl(): string {
  assertAzureConfigured();
  const cv = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(cv).digest("base64url");
  const payload = Buffer.from(
    JSON.stringify({ cv, exp: Date.now() + 10 * 60 * 1000 }),
  ).toString("base64url");
  const params = new URLSearchParams({
    client_id: config.azureClientId!,
    response_type: "code",
    redirect_uri: config.azureRedirectUri,
    response_mode: "query",
    scope: AZURE_SCOPES,
    state: signState(payload),
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${authority()}/authorize?${params.toString()}`;
}

async function tokenRequest(body: URLSearchParams): Promise<AzureTokenResponse> {
  const res = await fetch(`${authority()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as AzureTokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || `Azure token request failed (${res.status})`,
    );
  }
  return json;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) throw new Error("Azure token was incomplete.");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}

export async function exchangeAzureCode(code: string, state: string) {
  assertAzureConfigured();
  const { cv } = verifyState(state);
  const tokens = await tokenRequest(
    new URLSearchParams({
      client_id: config.azureClientId!,
      client_secret: config.azureClientSecret!,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.azureRedirectUri,
      code_verifier: cv,
      scope: AZURE_SCOPES,
    }),
  );
  if (!tokens.id_token || !tokens.refresh_token) {
    throw new Error(
      "Azure did not return a sign-in token. Confirm the app is a Web app and offline_access is allowed.",
    );
  }
  const claims = decodeJwtPayload(tokens.id_token);
  if (claims.aud !== config.azureClientId) {
    throw new Error("Azure sign-in was issued for a different application.");
  }
  if (claims.tid !== config.azureTenantId) {
    throw new Error("That account is not in the configured Azure AD tenant.");
  }
  return tokens;
}

export async function refreshAzureTokens(refreshToken: string) {
  assertAzureConfigured();
  const tokens = await tokenRequest(
    new URLSearchParams({
      client_id: config.azureClientId!,
      client_secret: config.azureClientSecret!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: AZURE_SCOPES,
    }),
  );
  return {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token ?? refreshToken,
  };
}

export async function readAzureProfile(
  accessToken: string,
  idToken: string,
): Promise<AzureProfile> {
  const claims = decodeJwtPayload(idToken);
  const oid = typeof claims.oid === "string" ? claims.oid : "";
  if (!oid) throw new Error("Azure account has no object id.");

  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName,employeeId",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const me = (await res.json().catch(() => ({}))) as {
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
    employeeId?: string | null;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(me.error?.message || `Could not read the Azure profile (${res.status})`);
  }

  const email = (me.mail || me.userPrincipalName || "").trim().toLowerCase();
  if (!email) throw new Error("Azure account has no email address.");

  return {
    oid,
    email,
    displayName: (me.displayName || email).trim(),
    employeeId: me.employeeId?.trim() || null,
  };
}
