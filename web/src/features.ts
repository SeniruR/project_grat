/**
 * Compose → recipients → Outlook drafts needs Entra auth + Graph mailbox
 * placement on the server. Enabled in dev by default so you can try mock/Graph
 * drafts; set VITE_COMPOSE_ENABLED=false to hide, or true in production builds.
 */
export const COMPOSE_ENABLED =
  import.meta.env.VITE_COMPOSE_ENABLED === "true" ||
  (import.meta.env.DEV && import.meta.env.VITE_COMPOSE_ENABLED !== "false");

export const COMPOSE_UNAVAILABLE_REASON =
  "Sending will be available when sign-in and mail delivery are fully set up.";
