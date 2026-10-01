import { devAuthProvider } from "./dev.js";
import type { AuthProvider } from "./types.js";

export function getAuthProvider(): AuthProvider {
  return devAuthProvider;
}

export type { AuthProvider, AuthUser, DevLoginInput, AppRole } from "./types.js";
