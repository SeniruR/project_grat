import type { ApiUser } from "../api/client";

export type AppRole = "USER" | "DESIGNER" | "ADMIN";

export function isAdmin(user: ApiUser | null | undefined) {
  return user?.role === "ADMIN";
}

export function canManageDesigns(user: ApiUser | null | undefined) {
  return user?.role === "DESIGNER" || user?.role === "ADMIN";
}

export function roleLabel(role: AppRole | string) {
  if (role === "ADMIN") return "Admin";
  if (role === "DESIGNER") return "Designer";
  return "User";
}
