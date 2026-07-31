import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { parseAppRole } from "../lib/roles.js";

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/admin/audit",
    { preHandler: [app.requireAdmin] },
    async () => {
      const events = await prisma.auditEvent.findMany({
        take: 50,
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
};
