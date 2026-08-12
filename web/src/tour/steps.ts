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
    id: "home-cards",
    target: "home-cards",
    title: "Send a thank-you email",
    body: "Open Cards to pick a design and send it to colleagues by email.",
    path: () => "/",
  },
  {
    id: "hub-browse",
    target: "hub-browse",
    title: "Browse cards",
    body: "Start here to find shared thank-you cards ready to send.",
    path: () => "/emails",
  },
  {
    id: "marketplace",
    target: "marketplace-browse",
    title: "Choose a design",
    body: "Search or filter cards, then open one to preview it before sending.",
    path: () => "/marketplace",
  },
  {
    id: "card-detail",
    target: "send-card",
    title: "Send this card",
    body: "Press Send this card to open compose and prepare the email.",
    path: (ctx) =>
      ctx.templateId ? `/marketplace/${ctx.templateId}` : "/marketplace",
    needsTemplate: true,
  },
  {
    id: "compose-recipients",
    target: "compose-recipients",
    title: "Add recipients",
    body: "Search for colleagues or type an email, then add who should receive the message.",
    path: (ctx) =>
      ctx.templateId ? `/cards/${ctx.templateId}/compose` : "/marketplace",
    needsTemplate: true,
    needsCompose: true,
  },
  {
    id: "compose-from",
    target: "compose-from",
    title: "Sender is set for you",
    body: "Who the email is from comes from your login. You do not need to type it.",
    path: (ctx) =>
      ctx.templateId ? `/cards/${ctx.templateId}/compose` : "/marketplace",
    needsTemplate: true,
    needsCompose: true,
  },
  {
    id: "compose-subject",
    target: "compose-subject",
    title: "Email subject",
    body: "The subject comes from the card. Names fill in after you pick recipients.",
    path: (ctx) =>
      ctx.templateId ? `/cards/${ctx.templateId}/compose` : "/marketplace",
    needsTemplate: true,
    needsCompose: true,
  },
  {
    id: "compose-send",
    target: "compose-send",
    title: "Send the email",
    body: "When at least one recipient is selected, send (or create drafts). This tour will not send anything for you.",
    path: (ctx) =>
      ctx.templateId ? `/cards/${ctx.templateId}/compose` : "/marketplace",
    needsTemplate: true,
    needsCompose: true,
  },
  {
    id: "sent",
    target: "sent-list",
    title: "Check what you sent",
    body: "Your sent emails appear here — subject, recipient, and when.",
    path: () => "/sent",
    needsCompose: true,
  },
];

/** Designer: add a design, create categories, share cards. */
const DESIGNER_STEPS: TourStep[] = [
  {
    id: "home-cards",
    target: "home-cards",
    title: "Design cards for others",
    body: "Open Cards to create designs and categories colleagues can use when sending.",
    path: () => "/",
  },
  {
    id: "hub-mycards",
    target: "hub-mycards",
    title: "My cards studio",
    body: "This is where you manage designs, categories, and sharing.",
    path: () => "/emails",
  },
  {
    id: "mycards-categories",
    target: "mycards-categories",
    title: "Categories",
    body: "Open Categories to group cards (for example by team or occasion).",
    path: () => "/cards",
  },
  {
    id: "categories-create",
    target: "categories-create",
    title: "Create a category",
    body: "Type a name and press Add. You can rename or delete categories later if unused.",
    path: () => "/cards?tourCategories=1",
  },
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
    body: "Saved designs appear here. Open one to edit placeholders, category, and visibility.",
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
    id: "home-cards",
    target: "home-cards",
    title: "Start with Cards",
    body: "Admins manage people and activity, and can design or send cards like other roles.",
    path: () => "/",
  },
  {
    id: "hub-admin",
    target: "hub-admin",
    title: "Admin hub",
    body: "Open Admin for people, send summary, settings, and the audit log.",
    path: () => "/emails",
  },
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
    id: "hub-mycards",
    target: "hub-mycards",
    title: "You can design too",
    body: "Admins also get My cards — create designs and categories the same way designers do.",
    path: () => "/emails",
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
