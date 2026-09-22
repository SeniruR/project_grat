import { prisma } from "../../db.js";
import {
  DevLoginRejected,
  type AuthProvider,
  type AuthUser,
  type DevLoginInput,
} from "./types.js";

function toAuthUser(user: {
  id: string;
  aadOid: string;
  email: string;
  displayName: string;
  role: "USER" | "DESIGNER" | "ADMIN";
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
    const employeeNumber = input.employeeNumber.trim();

    const existing = await prisma.user.findFirst({
      where: { email, employeeNumber },
    });
    if (!existing) {
      throw new DevLoginRejected(
        "That employee number does not match this office email.",
      );
    }

    const user = input.role
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { role: input.role },
        })
      : existing;

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
