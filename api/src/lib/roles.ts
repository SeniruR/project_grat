import type { AppRole } from "../providers/auth/types.js";

export type RoleUser = { id: string; role: string };

export function isAdmin(user: RoleUser) {
  return user.role === "ADMIN";
}

export function isDesigner(user: RoleUser) {
  return user.role === "DESIGNER" || user.role === "ADMIN";
}

/** Can create / edit design studio templates. */
export function canManageDesigns(user: RoleUser) {
  return isDesigner(user);
}

/** Shared/per-person placeholders and image overrides during Compose. */
export function canUseAdvancedCompose(user: RoleUser) {
  return isDesigner(user);
}

export function canViewTemplate(
  template: { ownerId: string; visibility: string; status: string },
  user: RoleUser,
) {
  if (isAdmin(user) || template.ownerId === user.id) return true;
  // Marketplace: shared + published cards for everyone (including designers)
  if (template.visibility === "SHARED" && template.status === "PUBLISHED") {
    return true;
  }
  // Designers can also peek at shared drafts from others (org collaboration)
  if (isDesigner(user) && template.visibility === "SHARED") return true;
  return false;
}

export function canEditTemplate(
  template: { ownerId: string },
  user: RoleUser,
) {
  if (isAdmin(user)) return true;
  return canManageDesigns(user) && template.ownerId === user.id;
}

/** Normal users may only compose from marketplace (published shared) cards. */
export function canComposeTemplate(
  template: { ownerId: string; visibility: string; status: string },
  user: RoleUser,
) {
  if (!canViewTemplate(template, user)) return false;
  if (isDesigner(user)) return true;
  return template.visibility === "SHARED" && template.status === "PUBLISHED";
}

export function parseAppRole(value: unknown): AppRole | null {
  if (value === "USER" || value === "DESIGNER" || value === "ADMIN") {
    return value;
  }
  return null;
}
