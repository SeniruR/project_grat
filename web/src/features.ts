/**
 * Compose → recipients → Outlook drafts needs Entra auth + Graph mailbox
 * placement on the server. Keep off until those are wired in production.
 */
export const COMPOSE_ENABLED = false;

export const COMPOSE_UNAVAILABLE_REASON =
  "Compose starts when Entra ID sign-in and server mail placement are completed.";
