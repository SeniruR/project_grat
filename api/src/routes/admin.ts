import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/admin/audit",
    { preHandler: [app.requireAdmin] },
    async (request) => {
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
      const [users, templates, drafts, audits] = await Promise.all([
        prisma.user.count(),
        prisma.template.count(),
        prisma.outboundDraft.count(),
        prisma.auditEvent.count(),
      ]);
      return { users, templates, drafts, audits };
    },
  );
};
