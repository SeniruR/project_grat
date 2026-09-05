import { COMPOSE_ENABLED } from "../features";
import type { AppRole } from "../lib/roles";

export type TourStepContext = {
  templateId: string | null;
};

export type TourStep = {
  id: string;
  /** Matches `data-tour` on the page. */
  target: string;
  title: string;
  body: string;
  path: (ctx: TourStepContext) => string;
  /** Marketplace / shared card id. */
  needsTemplate?: boolean;
  /** Designer studio card (`/cards/:id`). */
  needsOwnedTemplate?: boolean;
  /** Omitted when compose is disabled. */
  needsCompose?: boolean;
};

/** Normal user: how to send a thank-you email. */
const USER_STEPS: TourStep[] = [
  {
    id: "marketplace",
    target: "marketplace-browse",
    title: "Choose a card",
    body: "These are ready to give. Click one that says what you mean.",
    path: () => "/marketplace",
  },
  {
    id: "compose-recipients",
    target: "compose-recipients",
    title: "Who is this for?",
    body: "Search for a colleague or type an email, then add who should receive it.",
    path: (ctx) =>
      ctx.templateId ? `/cards/${ctx.templateId}/compose` : "/marketplace",
    needsTemplate: true,
    needsCompose: true,
  },
  {
    id: "compose-subject",
    target: "compose-subject",
    title: "The subject is ready",
    body: "It comes with the card. Names fill in after you choose people.",
    path: (ctx) =>
      ctx.templateId ? `/cards/${ctx.templateId}/compose` : "/marketplace",
    needsTemplate: true,
    needsCompose: true,
  },
  {
    id: "compose-send",
    target: "compose-send",
    title: "Send it",
    body: "When at least one person is chosen, send. You’ll confirm names before anything goes out. This tour will not send anything for you.",
    path: (ctx) =>
      ctx.templateId ? `/cards/${ctx.templateId}/compose` : "/marketplace",
    needsTemplate: true,
    needsCompose: true,
  },
  {
    id: "sent",
    target: "sent-list",
    title: "Cards you’ve given",
    body: "Open History in the top right to see who received a card and when.",
    path: () => "/sent",
    needsCompose: true,
  },
];

/** Designer: add a design, create categories, share cards. */
const DESIGNER_STEPS: TourStep[] = [
  {
    id: "mycards-new",
    target: "mycards-new",
    title: "Add a new design",
    body: "Press New card to import a Canva ZIP or upload an image as a thank-you card.",
    path: () => "/cards",
  },
  {
    id: "design-import",
    target: "design-import",
    title: "Import your design",
    body: "Pick Import from Canva (best for email text) or Upload image, then choose your file.",
    path: () => "/cards/new",
  },
  {
    id: "design-save",
    target: "design-save",
    title: "Name and save",
    body: "Give the card a name, set a subject if you like, then Save. You can edit and share it afterward.",
    path: () => "/cards/new",
  },
  {
    id: "mycards-list",
    target: "mycards-list",
    title: "Your card library",
    body: "Saved designs appear here. Open one to edit placeholders and sharing.",
    path: () => "/cards",
  },
  {
    id: "design-visibility",
    target: "design-visibility",
    title: "Share the card",
    body: "Set visibility to Shared so everyone can find it under Browse cards and send it.",
    path: (ctx) =>
      ctx.templateId ? `/cards/${ctx.templateId}` : "/cards",
    needsOwnedTemplate: true,
  },
  {
    id: "design-send",
    target: "design-send",
    title: "Send from your design",
    body: "Designers can also send. Send opens compose with advanced fill-in tools.",
    path: (ctx) =>
      ctx.templateId ? `/cards/${ctx.templateId}` : "/cards",
    needsOwnedTemplate: true,
    needsCompose: true,
  },
];

const ADMIN_STEPS: TourStep[] = [
  {
    id: "admin-stats",
    target: "admin-stats",
    title: "At a glance",
    body: "These counts show users, designers, cards, sends, and audit events across the org.",
    path: () => "/admin",
  },
  {
    id: "admin-tiles",
    target: "admin-tiles",
    title: "Admin tools",
    body: "Each tile opens a tool. Next stops walk through the main admin pages.",
    path: () => "/admin",
  },
  {
    id: "admin-people",
    target: "admin-people",
    title: "People and roles",
    body: "Assign Admin, Designer, or User roles and remove unused accounts.",
    path: () => "/admin/people",
  },
  {
    id: "admin-summary",
    target: "admin-summary",
    title: "Send summary",
    body: "See what each person has sent — jobs, message counts, and recent cards.",
    path: () => "/admin/summary",
  },
  {
    id: "admin-settings",
    target: "admin-settings",
    title: "Send settings",
    body: "Choose which name titles (Mr., Mrs., Sir, …) become recipient groups when sending.",
    path: () => "/admin/settings",
  },
  {
    id: "admin-audit",
    target: "admin-audit",
    title: "Audit log",
    body: "Browse detailed events. Expand a row to inspect the payload.",
    path: () => "/admin/audit",
  },
  {
    id: "mycards-list",
    target: "mycards-list",
    title: "You can design too",
    body: "Open your name in the top right, then My cards — create the designs others will give.",
    path: () => "/cards",
  },
];

function applyComposeFilter(steps: TourStep[]): TourStep[] {
  return steps.filter((s) => !s.needsCompose || COMPOSE_ENABLED);
}

export function getTourSteps(role: AppRole | string | undefined): TourStep[] {
  if (role === "ADMIN") return applyComposeFilter(ADMIN_STEPS);
  if (role === "DESIGNER") return applyComposeFilter(DESIGNER_STEPS);
  return applyComposeFilter(USER_STEPS);
}
