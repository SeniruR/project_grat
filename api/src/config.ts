import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const publicApiUrl = (process.env.PUBLIC_API_URL ?? "http://localhost:3001").replace(
  /\/$/,
  "",
);

const azureTenantId = optional("AZURE_TENANT_ID");
const azureClientId = optional("AZURE_CLIENT_ID");
const azureClientSecret = optional("AZURE_CLIENT_SECRET");

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET", "dev-only-change-me-before-azure"),
  corsOrigins,
  /** Used when rewriting HTML image src to absolute URLs */
  publicApiUrl,
  authMode: (process.env.AUTH_MODE ?? "dev") as "dev" | "azure",
  directoryMode: (process.env.DIRECTORY_MODE ?? "mock") as "mock" | "graph",
  mailMode: (process.env.MAIL_MODE ?? "mock") as "mock" | "graph" | "smtp",

  /** Azure AD app registration. Fill these in when the identity team sends them. */
  azureTenantId,
  azureClientId,
  azureClientSecret,
  azureRedirectUri:
    optional("AZURE_REDIRECT_URI") ?? `${publicApiUrl}/auth/azure/callback`,
  azureWebOrigin: optional("AZURE_WEB_ORIGIN") ?? corsOrigins[0] ?? "http://localhost:5173",
  /** Comma-separated work emails that become ADMIN on Azure sign-in. */
  azureAdminEmails: (process.env.AZURE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  azureReady: Boolean(azureTenantId && azureClientId && azureClientSecret),
  /**
   * Optional mailbox UPN for app-only Graph drafts.
   * If unset, drafts are created in the requester's email mailbox.
   */
  graphMailboxUpn: optional("GRAPH_MAILBOX_UPN"),

  /** Gmail / SMTP (required when MAIL_MODE=smtp) */
  smtpHost: optional("SMTP_HOST") ?? "smtp.gmail.com",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
  smtpUser: optional("SMTP_USER"),
  smtpPass: optional("SMTP_PASS"),
  /** From address; defaults to SMTP_USER */
  smtpFrom: optional("SMTP_FROM"),
  smtpFromName: optional("SMTP_FROM_NAME"),
};
