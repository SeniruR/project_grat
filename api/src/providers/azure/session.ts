import { prisma } from "../../db.js";
import { config } from "../../config.js";
import type { AuthUser } from "../auth/types.js";
import {
  readAzureProfile,
  refreshAzureTokens,
  type AzureProfile,
} from "./oauth.js";

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

async function uniqueEmployeeNumber(preferred: string, ignoreUserId?: string) {
  const base = preferred.replace(/\s+/g, "").slice(0, 64) || "azure-user";
  let candidate = base;
  for (let i = 0; i < 6; i++) {
    const hit = await prisma.user.findUnique({
      where: { employeeNumber: candidate },
    });
    if (!hit || hit.id === ignoreUserId) return candidate;
    candidate = `${base.slice(0, 48)}-${i + 1}`;
  }
  return `${base.slice(0, 40)}-${Date.now().toString(36)}`;
}

export async function upsertAzureUser(
  profile: AzureProfile,
  refreshToken: string,
): Promise<AuthUser> {
  const email = profile.email.toLowerCase();
  const existing =
    (await prisma.user.findUnique({ where: { aadOid: profile.oid } })) ??
    (await prisma.user.findUnique({ where: { email } }));

  const promote =
    config.azureAdminEmails.includes(email) &&
    (!existing || existing.role === "USER");
  const employeeNumber = await uniqueEmployeeNumber(
    profile.employeeId || existing?.employeeNumber || profile.oid,
    existing?.id,
  );

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          aadOid: profile.oid,
          email,
          displayName: profile.displayName,
          employeeNumber,
          azureRefreshToken: refreshToken,
          isDirectory: true,
          ...(promote ? { role: "ADMIN" as const } : {}),
        },
      })
    : await prisma.user.create({
        data: {
          aadOid: profile.oid,
          email,
          displayName: profile.displayName,
          employeeNumber,
          role: promote ? "ADMIN" : "USER",
          isDirectory: true,
          azureRefreshToken: refreshToken,
        },
      });

  await prisma.auditEvent.create({
    data: {
      actorId: user.id,
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      payload: { mode: "azure", email },
    },
  });

  return toAuthUser(user);
}

/** Access token for Microsoft Graph calls as the signed-in user. */
export async function getDelegatedGraphToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { azureRefreshToken: true },
  });
  if (!user?.azureRefreshToken) {
    throw new Error(
      "Sign out and sign in with your work account before searching people or sending mail.",
    );
  }
  const next = await refreshAzureTokens(user.azureRefreshToken);
  if (next.refreshToken !== user.azureRefreshToken) {
    await prisma.user.update({
      where: { id: userId },
      data: { azureRefreshToken: next.refreshToken },
    });
  }
  return next.accessToken;
}

export async function profileFromAzureTokens(
  accessToken: string,
  idToken: string,
) {
  return readAzureProfile(accessToken, idToken);
}
