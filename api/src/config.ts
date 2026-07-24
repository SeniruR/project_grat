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

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET", "dev-only-change-me-before-azure"),
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Used when rewriting HTML image src to absolute URLs */
  publicApiUrl: (process.env.PUBLIC_API_URL ?? "http://localhost:3001").replace(
    /\/$/,
    "",
  ),
  authMode: (process.env.AUTH_MODE ?? "dev") as "dev" | "azure",
  directoryMode: (process.env.DIRECTORY_MODE ?? "mock") as "mock" | "graph",
  mailMode: (process.env.MAIL_MODE ?? "mock") as "mock" | "graph",

  /** Azure AD app registration (required when MAIL_MODE=graph) */
  azureTenantId: optional("AZURE_TENANT_ID"),
  azureClientId: optional("AZURE_CLIENT_ID"),
  azureClientSecret: optional("AZURE_CLIENT_SECRET"),
  /**
   * Optional mailbox UPN for app-only Graph drafts.
   * If unset, drafts are created in the requester's email mailbox.
   */
  graphMailboxUpn: optional("GRAPH_MAILBOX_UPN"),
};
