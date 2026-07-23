export type AppRole = "USER" | "ADMIN";

export type AuthUser = {
  id: string;
  aadOid: string;
  email: string;
  displayName: string;
  role: AppRole;
};

export type DevLoginInput = {
  email: string;
  displayName: string;
  role?: AppRole;
};

/**
 * Swap-ready auth surface.
 * DevAuthProvider: local lookalike login.
 * Later: AzureAdAuthProvider using MSAL + Graph profile.
 */
export interface AuthProvider {
  readonly mode: "dev" | "azure";
  /** Dev-only. Azure provider will throw or redirect instead. */
  loginDev?(input: DevLoginInput): Promise<AuthUser>;
}
