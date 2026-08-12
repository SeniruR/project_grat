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
  // Marketplace / Browse cards — shared cards are visible to everyone signed in.
  // (status PUBLISHED is kept in sync when sharing; older SHARED+DRAFT rows still count.)
  if (template.visibility === "SHARED") return true;
  return false;
}

export function canEditTemplate(
  template: { ownerId: string },
  user: RoleUser,
) {
  if (isAdmin(user)) return true;
  return canManageDesigns(user) && template.ownerId === user.id;
}

/** Normal users may compose any card they can open from Browse cards (shared). */
export function canComposeTemplate(
  template: { ownerId: string; visibility: string; status: string },
  user: RoleUser,
) {
  if (!canViewTemplate(template, user)) return false;
  if (isDesigner(user)) return true;
  return template.visibility === "SHARED";
}

export function parseAppRole(value: unknown): AppRole | null {
  if (value === "USER" || value === "DESIGNER" || value === "ADMIN") {
    return value;
  }
  return null;
}
