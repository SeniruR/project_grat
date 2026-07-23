import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
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
};
