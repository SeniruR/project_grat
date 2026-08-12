import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { parseAppRole } from "../lib/roles.js";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  DEFAULT_NAME_HONORIFICS,
  NAME_HONORIFICS_SETTING_KEY,
  normalizeNameHonorifics,
} from "../lib/nameHonorifics.js";

async function loadNameHonorifics() {
  const row = await prisma.appSetting.findUnique({
    where: { key: NAME_HONORIFICS_SETTING_KEY },
  });
  if (!row) return [...DEFAULT_NAME_HONORIFICS];
  return normalizeNameHonorifics(row.value);
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/admin/audit",
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const query = request.query as {
        take?: string;
        q?: string;
        action?: string;
      };
      const takeRaw = Number(query.take ?? 50);
      const take = Number.isFinite(takeRaw)
        ? Math.min(200, Math.max(1, Math.floor(takeRaw)))
        : 50;
      const q = query.q?.trim() ?? "";
      const action = query.action?.trim() ?? "";

      const where: Prisma.AuditEventWhereInput = {
        ...(action
          ? { action: { equals: action, mode: "insensitive" } }
          : {}),
        ...(q
          ? {
              OR: [
                { action: { contains: q, mode: "insensitive" } },
                { entityType: { contains: q, mode: "insensitive" } },
                { entityId: { contains: q, mode: "insensitive" } },
                {
                  actor: {
                    displayName: { contains: q, mode: "insensitive" },
                  },
                },
                {
                  actor: {
                    email: { contains: q, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      };

      const events = await prisma.auditEvent.findMany({
        where,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          actor: {
            select: { id: true, displayName: true, email: true, role: true },
          },
        },
      });
      return { events };
    },
  );

  app.get(
    "/admin/stats",
    { preHandler: [app.requireAdmin] },
    async () => {
      const [users, templates, drafts, audits, designers] = await Promise.all([
        prisma.user.count(),
        prisma.template.count(),
        prisma.outboundDraft.count(),
        prisma.auditEvent.count(),
        prisma.user.count({ where: { role: "DESIGNER" } }),
      ]);
      return { users, templates, drafts, audits, designers };
    },
  );

  /**
   * Per-user send summary for admins: all jobs + per-message details.
   */
  app.get(
    "/admin/send-summary",
    { preHandler: [app.requireAdmin] },
    async () => {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          draftJobs: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              total: true,
              completed: true,
              templateName: true,
              categoryName: true,
              createdAt: true,
              drafts: {
                orderBy: { createdAt: "desc" },
                select: {
                  id: true,
                  subject: true,
                  recipientName: true,
                  recipientEmail: true,
                  status: true,
                  createdAt: true,
                },
              },
              _count: { select: { drafts: true } },
            },
          },
          _count: {
            select: { draftJobs: true },
          },
        },
      });

      const rows = users
        .map((u) => {
          const jobs = u.draftJobs;
          const messageCount = jobs.reduce(
            (sum, j) => sum + j._count.drafts,
            0,
          );
          const lastSentAt = jobs[0]?.createdAt ?? null;
          return {
            id: u.id,
            email: u.email,
            displayName: u.displayName,
            role: u.role,
            jobCount: u._count.draftJobs,
            messageCount,
            lastSentAt: lastSentAt?.toISOString() ?? null,
            recentJobs: jobs.map((j) => ({
              id: j.id,
              status: j.status,
              total: j.total,
              completed: j.completed,
              messageCount: j._count.drafts,
              templateName: j.templateName,
              categoryName: j.categoryName,
              createdAt: j.createdAt.toISOString(),
              messages: j.drafts.map((d) => ({
                id: d.id,
                subject: d.subject,
                recipientName: d.recipientName,
                recipientEmail: d.recipientEmail,
                status: d.status,
                createdAt: d.createdAt.toISOString(),
              })),
            })),
            recentTemplates: [
              ...new Set(
                jobs
                  .map((j) => j.templateName)
                  .filter((n) => Boolean(n?.trim())),
              ),
            ].slice(0, 8),
          };
        })
        .sort((a, b) => {
          if (a.lastSentAt && b.lastSentAt) {
            return b.lastSentAt.localeCompare(a.lastSentAt);
          }
          if (a.lastSentAt) return -1;
          if (b.lastSentAt) return 1;
          return b.messageCount - a.messageCount;
        });

      return { users: rows };
    },
  );

  app.get(
    "/admin/users",
    { preHandler: [app.requireAdmin] },
    async () => {
      const users = await prisma.user.findMany({
        orderBy: { displayName: "asc" },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          isDirectory: true,
          createdAt: true,
          _count: {
            select: { ownedTemplates: true, draftJobs: true },
          },
        },
      });
      return { users };
    },
  );

  app.patch(
    "/admin/users/:id",
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const actor = request.appUser!;
      const { id } = request.params as { id: string };
      const body = z
        .object({
          role: z.enum(["USER", "DESIGNER", "ADMIN"]),
        })
        .safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Invalid role" });
      }
      const role = parseAppRole(body.data.role);
      if (!role) {
        return reply.code(400).send({ error: "Invalid role" });
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "User not found" });
      }

      if (existing.id === actor.id && role !== "ADMIN") {
        return reply
          .code(400)
          .send({ error: "You cannot remove your own admin role" });
      }

      const user = await prisma.user.update({
        where: { id },
        data: { role },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          isDirectory: true,
          createdAt: true,
          _count: {
            select: { ownedTemplates: true, draftJobs: true },
          },
        },
      });

      await writeAudit({
        actorId: actor.id,
        action: "user.role_change",
        entityType: "user",
        entityId: user.id,
        payload: { from: existing.role, to: role },
      });

      return { user };
    },
  );

  app.delete(
    "/admin/users/:id",
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const actor = request.appUser!;
      const { id } = request.params as { id: string };

      if (id === actor.id) {
        return reply.code(400).send({ error: "You cannot delete your own account" });
      }

      const existing = await prisma.user.findUnique({
        where: { id },
        include: {
          _count: {
            select: { ownedTemplates: true, draftJobs: true },
          },
        },
      });
      if (!existing) {
        return reply.code(404).send({ error: "User not found" });
      }

      if (existing.role === "ADMIN") {
        return reply.code(400).send({ error: "Admin users cannot be deleted" });
      }

      if (existing._count.ownedTemplates > 0) {
        return reply.code(400).send({
          error: "Cannot delete a user who still owns templates",
        });
      }

      if (existing._count.draftJobs > 0) {
        return reply.code(400).send({
          error: "Cannot delete a user who has send jobs",
        });
      }

      // Favorites cascade; detach audit actor so history remains.
      await prisma.auditEvent.updateMany({
        where: { actorId: id },
        data: { actorId: null },
      });
      await prisma.templateFavorite.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });

      await writeAudit({
        actorId: actor.id,
        action: "user.deleted",
        entityType: "user",
        entityId: id,
        payload: {
          email: existing.email,
          displayName: existing.displayName,
          role: existing.role,
        },
      });

      return reply.code(204).send();
    },
  );

  app.get(
    "/admin/settings/name-honorifics",
    { preHandler: [app.requireAdmin] },
    async () => ({ honorifics: await loadNameHonorifics() }),
  );

  app.put(
    "/admin/settings/name-honorifics",
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const actor = request.appUser!;
      const body = z
        .object({
          honorifics: z
            .array(
              z.object({
                value: z.string().min(1).max(40),
                label: z.string().min(1).max(40).optional(),
              }),
            )
            .max(40),
        })
        .safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Invalid prefix list" });
      }

      const honorifics = normalizeNameHonorifics(
        body.data.honorifics.map((h) => ({
          value: h.value,
          label: h.label ?? h.value,
        })),
      );

      await prisma.appSetting.upsert({
        where: { key: NAME_HONORIFICS_SETTING_KEY },
        create: {
          key: NAME_HONORIFICS_SETTING_KEY,
          value: honorifics,
        },
        update: { value: honorifics },
      });

      await writeAudit({
        actorId: actor.id,
        action: "settings.name_honorifics_update",
        entityType: "app_setting",
        entityId: NAME_HONORIFICS_SETTING_KEY,
        payload: { count: honorifics.length, honorifics },
      });

      return { honorifics };
    },
  );
};
