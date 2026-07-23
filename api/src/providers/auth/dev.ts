import { prisma } from "../../db.js";
import type { AuthProvider, AuthUser, DevLoginInput } from "./types.js";

function toAuthUser(user: {
  id: string;
  aadOid: string;
  email: string;
  displayName: string;
  role: "USER" | "ADMIN";
}): AuthUser {
  return {
    id: user.id,
    aadOid: user.aadOid,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export const devAuthProvider: AuthProvider = {
  mode: "dev",

  async loginDev(input: DevLoginInput): Promise<AuthUser> {
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();
    const role = input.role ?? "USER";
    const aadOid = `dev-${email}`;

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        displayName,
        role,
        aadOid,
        isDirectory: true,
      },
      update: {
        displayName,
        role,
      },
    });

    await prisma.auditEvent.create({
      data: {
        actorId: user.id,
        action: "auth.login",
        entityType: "user",
        entityId: user.id,
        payload: { mode: "dev", email },
      },
    });

    return toAuthUser(user);
  },
};
