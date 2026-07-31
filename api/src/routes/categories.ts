import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { canManageDesigns } from "../lib/roles.js";

const nameBody = z.object({
  name: z.string().trim().min(1).max(80),
});

function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/categories",
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = request.appUser!;
      if (!canManageDesigns(user) && user.role !== "USER") {
        return { categories: [] };
      }
      const q = (request.query as { q?: string }).q?.trim();
      const categories = await prisma.templateCategory.findMany({
        where: q
          ? { name: { contains: q, mode: "insensitive" } }
          : undefined,
        orderBy: { name: "asc" },
        include: {
          createdBy: {
            select: { id: true, displayName: true, email: true },
          },
          _count: { select: { templates: true } },
        },
      });
      return { categories };
    },
  );

  app.post(
    "/categories",
    { preHandler: [app.requireDesigner] },
    async (request, reply) => {
      const user = request.appUser!;
      const parsed = nameBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Category name is required" });
      }
      const name = normalizeCategoryName(parsed.data.name);
      const existing = await prisma.templateCategory.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });
      if (existing) {
        return {
          category: await prisma.templateCategory.findUniqueOrThrow({
            where: { id: existing.id },
            include: {
              createdBy: {
                select: { id: true, displayName: true, email: true },
              },
              _count: { select: { templates: true } },
            },
          }),
          created: false,
        };
      }

      const category = await prisma.templateCategory.create({
        data: {
          name,
          createdById: user.id,
        },
        include: {
          createdBy: {
            select: { id: true, displayName: true, email: true },
          },
          _count: { select: { templates: true } },
        },
      });

      await writeAudit({
        actorId: user.id,
        action: "category.created",
        entityType: "category",
        entityId: category.id,
        payload: { name },
      });

      return reply.code(201).send({ category, created: true });
    },
  );

  app.patch(
    "/categories/:id",
    { preHandler: [app.requireDesigner] },
    async (request, reply) => {
      const user = request.appUser!;
      const { id } = request.params as { id: string };
      const parsed = nameBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Category name is required" });
      }
      const name = normalizeCategoryName(parsed.data.name);

      const existing = await prisma.templateCategory.findUnique({
        where: { id },
      });
      if (!existing) {
        return reply.code(404).send({ error: "Category not found" });
      }
      if (existing.createdById !== user.id) {
        return reply.code(403).send({
          error: "Only the person who created this category can rename it",
        });
      }

      const clash = await prisma.templateCategory.findFirst({
        where: {
          id: { not: id },
          name: { equals: name, mode: "insensitive" },
        },
      });
      if (clash) {
        return reply
          .code(400)
          .send({ error: "Another category already uses that name" });
      }

      const category = await prisma.templateCategory.update({
        where: { id },
        data: { name },
        include: {
          createdBy: {
            select: { id: true, displayName: true, email: true },
          },
          _count: { select: { templates: true } },
        },
      });

      await writeAudit({
        actorId: user.id,
        action: "category.renamed",
        entityType: "category",
        entityId: id,
        payload: { from: existing.name, to: name },
      });

      return { category };
    },
  );

  app.delete(
    "/categories/:id",
    { preHandler: [app.requireDesigner] },
    async (request, reply) => {
      const user = request.appUser!;
      const { id } = request.params as { id: string };
      const existing = await prisma.templateCategory.findUnique({
        where: { id },
        include: { _count: { select: { templates: true } } },
      });
      if (!existing) {
        return reply.code(404).send({ error: "Category not found" });
      }
      if (existing.createdById !== user.id) {
        return reply.code(403).send({
          error: "Only the person who created this category can delete it",
        });
      }
      if (existing._count.templates > 0) {
        return reply.code(400).send({
          error:
            "Category is in use by templates and cannot be deleted until those templates are removed or reassigned",
        });
      }

      await prisma.templateCategory.delete({ where: { id } });
      await writeAudit({
        actorId: user.id,
        action: "category.deleted",
        entityType: "category",
        entityId: id,
        payload: { name: existing.name },
      });
      return reply.code(204).send();
    },
  );
};
