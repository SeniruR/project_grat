import type { ApiUser } from "../api/client";

export type AppRole = "USER" | "DESIGNER" | "ADMIN";

export function isAdmin(user: ApiUser | null | undefined) {
  return user?.role === "ADMIN";
}

export function canManageDesigns(user: ApiUser | null | undefined) {
  return user?.role === "DESIGNER" || user?.role === "ADMIN";
}

/** Everyone lands on Browse cards. My designs and Admin stay available from the top bar. */
export function homePath(_user?: ApiUser | null) {
  return "/marketplace";
}

/** Shared/per-person placeholders and image overrides during Compose. */
export function canUseAdvancedCompose(user: ApiUser | null | undefined) {
  return canManageDesigns(user);
}

export function roleLabel(role: AppRole | string) {
  if (role === "ADMIN") return "Admin";
  if (role === "DESIGNER") return "Designer";
  return "User";
}
