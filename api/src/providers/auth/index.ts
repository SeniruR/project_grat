import { config } from "../../config.js";
import { devAuthProvider } from "./dev.js";
import type { AuthProvider } from "./types.js";

export function getAuthProvider(): AuthProvider {
  if (config.authMode === "azure") {
    throw new Error(
      "AUTH_MODE=azure is not wired yet. Keep AUTH_MODE=dev until Azure AD app details are ready.",
    );
  }
  return devAuthProvider;
}

export type { AuthProvider, AuthUser, DevLoginInput, AppRole } from "./types.js";
