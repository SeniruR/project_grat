import { prisma } from "../db.js";
import type { Prisma } from "../../generated/prisma/client.js";

export async function writeAudit(input: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: Prisma.InputJsonValue;
}) {
  return prisma.auditEvent.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      payload: input.payload ?? {},
    },
  });
}
