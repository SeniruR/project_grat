import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { resolveHtmlImageSrcs } from "../lib/htmlAssets.js";
import { config } from "../config.js";

const marketplaceListInclude = {
  owner: { select: { id: true, displayName: true, email: true } },
  category: { select: { id: true, name: true } },
  versions: {
    orderBy: { version: "desc" as const },
    take: 1,
    select: {
      id: true,
      version: true,
      previewUrl: true,
      createdAt: true,
    },
  },
} as const;

/**
 * Marketplace: published shared cards for all roles.
 * Favorites are per-user bookmarks for quick access.
 */
export const marketplaceRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/marketplace",
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = request.appUser!;
      const query = request.query as {
        q?: string;
        favorites?: string;
        categoryId?: string;
      };
      const q = query.q?.trim().toLowerCase();
      const categoryId = query.categoryId?.trim() || undefined;
      const favoritesOnly =
        query.favorites === "1" || query.favorites === "true";

      const favoriteRows = await prisma.templateFavorite.findMany({
        where: { userId: user.id },
        select: { templateId: true },
      });
      const favoriteIds = new Set(favoriteRows.map((f) => f.templateId));

      const templates = await prisma.template.findMany({
        where: {
          catalogType: "CARD",
          visibility: "SHARED",
          ...(categoryId ? { categoryId } : {}),
          ...(favoritesOnly ? { id: { in: [...favoriteIds] } } : {}),
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  {
                    owner: {
                      displayName: { contains: q, mode: "insensitive" },
                    },
                  },
                  {
                    category: {
                      name: { contains: q, mode: "insensitive" },
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        include: marketplaceListInclude,
      });

      return {
        templates: templates.map((t) => ({
          ...t,
          isFavorite: favoriteIds.has(t.id),
        })),
      };
    },
  );

  app.get(
    "/marketplace/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.appUser!;
      const { id } = request.params as { id: string };
      const template = await prisma.template.findFirst({
        where: {
          id,
          catalogType: "CARD",
          visibility: "SHARED",
        },
        include: {
          owner: marketplaceListInclude.owner,
          category: marketplaceListInclude.category,
          versions: {
            orderBy: { version: "desc" },
            take: 1,
          },
          assets: {
            where: { kind: "source" },
            orderBy: { createdAt: "desc" },
          },
        },
      });
      if (!template) {
        return reply.code(404).send({ error: "Marketplace card not found" });
      }

      const favorite = await prisma.templateFavorite.findUnique({
        where: {
          userId_templateId: { userId: user.id, templateId: template.id },
        },
      });

      const version = template.versions[0];
      const previewHtml = version?.compiledHtml
        ? resolveHtmlImageSrcs(
            version.compiledHtml,
            template.assets,
            config.publicApiUrl,
          )
        : null;

      return {
        template: {
          ...template,
          isFavorite: Boolean(favorite),
          versions: template.versions.map((v) => ({
            ...v,
            compiledHtml: v.compiledHtml
              ? resolveHtmlImageSrcs(
                  v.compiledHtml,
                  template.assets,
                  config.publicApiUrl,
                )
              : null,
          })),
        },
        previewHtml,
        previewUrl: version?.previewUrl ?? null,
      };
    },
  );

  app.get(
    "/favorites",
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = request.appUser!;
      const rows = await prisma.templateFavorite.findMany({
        where: {
          userId: user.id,
          template: {
            catalogType: "CARD",
            visibility: "SHARED",
          },
        },
        orderBy: { createdAt: "desc" },
        include: {
          template: { include: marketplaceListInclude },
        },
      });
      return {
        templates: rows.map((r) => ({
          ...r.template,
          isFavorite: true,
          favoritedAt: r.createdAt,
        })),
      };
    },
  );

  app.post(
    "/favorites/:templateId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.appUser!;
      const { templateId } = request.params as { templateId: string };
      const template = await prisma.template.findFirst({
        where: {
          id: templateId,
          catalogType: "CARD",
          visibility: "SHARED",
        },
        select: { id: true },
      });
      if (!template) {
        return reply
          .code(404)
          .send({ error: "Only published shared cards can be favorited" });
      }
      await prisma.templateFavorite.upsert({
        where: {
          userId_templateId: { userId: user.id, templateId },
        },
        create: { userId: user.id, templateId },
        update: {},
      });
      return { ok: true, isFavorite: true };
    },
  );

  app.delete(
    "/favorites/:templateId",
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = request.appUser!;
      const { templateId } = request.params as { templateId: string };
      await prisma.templateFavorite.deleteMany({
        where: { userId: user.id, templateId },
      });
      return { ok: true, isFavorite: false };
    },
  );
};
