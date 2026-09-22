export type AppRole = "USER" | "DESIGNER" | "ADMIN";

export type AuthUser = {
  id: string;
  aadOid: string;
  email: string;
  displayName: string;
  role: AppRole;
};

export type DevLoginInput = {
  email: string;
  employeeNumber: string;
  /** Demonstration only. Everyday sign-in keeps the directory role. */
  role?: AppRole;
};

export class DevLoginRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevLoginRejected";
  }
}

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
