import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { ensureUploadsDir, publicUploadUrl, removeUploadFile } from "../lib/uploads.js";
import {
  resolveHtmlImageSrcs,
  suggestedImgTag,
} from "../lib/htmlAssets.js";
import { config } from "../config.js";
import {
  canComposeTemplate,
  canEditTemplate,
  canManageDesigns,
  canViewTemplate,
} from "../lib/roles.js";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { unlink, stat } from "node:fs/promises";

const createBody = z.object({
  name: z.string().min(1).max(160),
  visibility: z.enum(["PRIVATE", "SHARED"]).default("PRIVATE"),
  categoryId: z.string().min(1).optional(),
  mode: z
    .enum(["blank", "html_import", "canva_html", "image_import"])
    .default("blank"),
  html: z.string().max(500_000).optional(),
  headerHtml: z.string().max(50_000).optional(),
  footerHtml: z.string().max(50_000).optional(),
});

const patchBody = z.object({
  name: z.string().min(1).max(160).optional(),
  visibility: z.enum(["PRIVATE", "SHARED"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  headerHtml: z.string().max(50_000).nullable().optional(),
  footerHtml: z.string().max(50_000).nullable().optional(),
});

const versionBody = z.object({
  designJson: z.any().optional(),
  compiledHtml: z.string().max(500_000).nullable().optional(),
  previewUrl: z.string().max(2000).nullable().optional(),
});

const templateInclude = {
  owner: { select: { id: true, displayName: true, email: true } },
  category: { select: { id: true, name: true } },
  versions: { orderBy: { version: "desc" as const }, take: 1 },
  /// Only user uploads — compiled flatten outputs are internal
  assets: {
    where: { kind: "source" },
    orderBy: { createdAt: "desc" as const },
  },
};

function canView(
  template: { ownerId: string; visibility: string; status: string },
  user: { id: string; role: string },
) {
  return canViewTemplate(template, user);
}

function canEdit(
  template: { ownerId: string },
  user: { id: string; role: string },
) {
  return canEditTemplate(template, user);
}

export const templateRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/templates",
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = request.appUser!;
      // Design studio — own templates only (marketplace is separate).
      if (!canManageDesigns(user)) {
        return { templates: [] };
      }
      const templates = await prisma.template.findMany({
        where: {
          catalogType: "CARD",
          ownerId: user.id,
        },
        orderBy: { updatedAt: "desc" },
        include: {
          owner: { select: { id: true, displayName: true, email: true } },
          category: { select: { id: true, name: true } },
          versions: { orderBy: { version: "desc" }, take: 1 },
          _count: { select: { assets: true } },
        },
      });

      const ids = templates.map((t) => t.id);
      const usageByTemplate = new Map<
        string,
        { total: Set<string>; sinceEdit: Set<string> }
      >();
      for (const id of ids) {
        usageByTemplate.set(id, { total: new Set(), sinceEdit: new Set() });
      }

      if (ids.length) {
        const jobs = await prisma.draftJob.findMany({
          where: { templateId: { in: ids } },
          select: {
            templateId: true,
            requesterId: true,
            createdAt: true,
          },
        });
        const editedAt = new Map(
          templates.map((t) => [t.id, t.updatedAt.getTime()] as const),
        );
        for (const job of jobs) {
          if (!job.templateId) continue;
          const bucket = usageByTemplate.get(job.templateId);
          if (!bucket) continue;
          bucket.total.add(job.requesterId);
          const cut = editedAt.get(job.templateId) ?? 0;
          if (job.createdAt.getTime() >= cut) {
            bucket.sinceEdit.add(job.requesterId);
          }
        }
      }

      return {
        templates: templates.map((t) => {
          const usage = usageByTemplate.get(t.id);
          return {
            ...t,
            usageTotalUsers: usage?.total.size ?? 0,
            usageSinceLastEdit: usage?.sinceEdit.size ?? 0,
          };
        }),
      };
    },
  );

  app.post(
    "/templates",
    { preHandler: [app.requireDesigner] },
    async (request, reply) => {
      const user = request.appUser!;
      const parsed = createBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid template payload" });
      }

      const { name, visibility, mode, html, headerHtml, footerHtml, categoryId } =
        parsed.data;

      if (mode === "html_import" && !html?.trim()) {
        return reply
          .code(400)
          .send({ error: "HTML is required for html_import mode" });
      }

      if (categoryId) {
        const cat = await prisma.templateCategory.findUnique({
          where: { id: categoryId },
        });
        if (!cat) {
          return reply.code(400).send({ error: "Category not found" });
        }
      }

      const designJson =
        mode === "html_import"
          ? { mode: "html_import", sourceHtml: html }
          : mode === "canva_html"
            ? { mode: "canva_html", source: "canva_zip" }
            : mode === "image_import"
              ? { mode: "image_import", source: "upload" }
              : {
                  mode: "blank",
                  objects: [],
                };

      const compiledHtml =
        mode === "html_import" ? html!.trim() : "<div></div>";

      const template = await prisma.template.create({
        data: {
          name: name.trim(),
          visibility,
          status: visibility === "SHARED" ? "PUBLISHED" : "DRAFT",
          catalogType: "CARD",
          ownerId: user.id,
          categoryId: categoryId || null,
          headerHtml: headerHtml?.trim() || null,
          footerHtml: footerHtml?.trim() || null,
          versions: {
            create: {
              version: 1,
              designJson,
              compiledHtml,
              createdById: user.id,
            },
          },
        },
        include: templateInclude,
      });

      await writeAudit({
        actorId: user.id,
        action: "template.created",
        entityType: "template",
        entityId: template.id,
        payload: { name: template.name, visibility, mode, categoryId },
      });

      return reply.code(201).send({ template });
    },
  );

  app.get(
    "/templates/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.appUser!;
      const { id } = request.params as { id: string };
      const template = await prisma.template.findUnique({
        where: { id },
        include: {
          ...templateInclude,
          versions: { orderBy: { version: "desc" } },
        },
      });

      if (!template || !canView(template, user)) {
        return reply.code(404).send({ error: "Template not found" });
      }

      return { template };
    },
  );

  app.patch(
    "/templates/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.appUser!;
      const { id } = request.params as { id: string };
      const parsed = patchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid update payload" });
      }

      const existing = await prisma.template.findUnique({ where: { id } });
      if (!existing || !canEdit(existing, user)) {
        return reply.code(404).send({ error: "Template not found" });
      }

      const data = parsed.data;
      if (data.categoryId) {
        const cat = await prisma.templateCategory.findUnique({
          where: { id: data.categoryId },
        });
        if (!cat) {
          return reply.code(400).send({ error: "Category not found" });
        }
      }

      // Keep status aligned with visibility so "Published" means marketplace-ready.
      const syncedStatus =
        data.status ??
        (data.visibility !== undefined
          ? data.visibility === "SHARED"
            ? "PUBLISHED"
            : "DRAFT"
          : undefined);

      const template = await prisma.template.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.visibility !== undefined
            ? { visibility: data.visibility }
            : {}),
          ...(syncedStatus !== undefined ? { status: syncedStatus } : {}),
          ...(data.categoryId !== undefined
            ? { categoryId: data.categoryId }
            : {}),
          ...(data.headerHtml !== undefined
            ? { headerHtml: data.headerHtml }
            : {}),
          ...(data.footerHtml !== undefined
            ? { footerHtml: data.footerHtml }
            : {}),
        },
        include: templateInclude,
      });

      await writeAudit({
        actorId: user.id,
        action: "template.updated",
        entityType: "template",
        entityId: template.id,
        payload: data,
      });

      return { template };
    },
  );

  app.post(
    "/templates/:id/versions",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.appUser!;
      const { id } = request.params as { id: string };
      const parsed = versionBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid version payload" });
      }

      const existing = await prisma.template.findUnique({
        where: { id },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      if (!existing || !canEdit(existing, user)) {
        return reply.code(404).send({ error: "Template not found" });
      }

      const nextVersion = (existing.versions[0]?.version ?? 0) + 1;
      const latest = existing.versions[0];

      const assets = await prisma.templateAsset.findMany({
        where: { templateId: id },
        select: { fileName: true, storageKey: true },
      });

      let compiledHtml =
        parsed.data.compiledHtml !== undefined
          ? parsed.data.compiledHtml
          : latest?.compiledHtml;
      if (typeof compiledHtml === "string") {
        compiledHtml = resolveHtmlImageSrcs(
          compiledHtml,
          assets,
          config.publicApiUrl,
        );
      }

      let designJson = (parsed.data.designJson ??
        latest?.designJson ??
        {}) as Record<string, unknown>;
      if (
        designJson &&
        typeof designJson === "object" &&
        designJson.mode === "html_import" &&
        typeof designJson.sourceHtml === "string"
      ) {
        designJson = {
          ...designJson,
          sourceHtml: resolveHtmlImageSrcs(
            designJson.sourceHtml,
            assets,
            config.publicApiUrl,
          ),
        };
      }

      const version = await prisma.templateVersion.create({
        data: {
          templateId: id,
          version: nextVersion,
          designJson: designJson as object,
          compiledHtml,
          previewUrl:
            parsed.data.previewUrl !== undefined
              ? parsed.data.previewUrl
              : latest?.previewUrl,
          createdById: user.id,
        },
      });

      await prisma.template.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      await writeAudit({
        actorId: user.id,
        action: "template.version_saved",
        entityType: "template",
        entityId: id,
        payload: { version: version.version },
      });

      return reply.code(201).send({ version });
    },
  );

  app.post(
    "/templates/:id/assets",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.appUser!;
      const { id } = request.params as { id: string };

      const existing = await prisma.template.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Template not found" });
      }
      // Owners/editors upload source/compiled; composers may only upload overrides.
      if (
        !canEdit(existing, user) &&
        !canComposeTemplate(existing, user)
      ) {
        return reply.code(404).send({ error: "Template not found" });
      }

      let kind: "source" | "compiled" | "override" = "source";
      let saved: {
        absPath: string;
        storageKey: string;
        fileName: string;
        mimeType: string;
        safeName: string;
      } | null = null;

      // Must consume each part's stream inside the loop or multipart hangs forever.
      for await (const part of request.parts()) {
        if (part.type !== "file") {
          if (part.fieldname === "kind") {
            const value = String(part.value);
            if (
              value === "compiled" ||
              value === "source" ||
              value === "override"
            ) {
              kind = value;
            }
          }
          continue;
        }

        const allowed = new Set([
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          // Canva HTML ZIP may ship web fonts referenced from @font-face
          "font/woff",
          "font/woff2",
          "font/ttf",
          "font/otf",
          "application/font-woff",
          "application/font-woff2",
          "application/x-font-ttf",
          "application/x-font-otf",
          "application/vnd.ms-fontobject",
          "application/octet-stream",
        ]);
        const fileExt = path.extname(part.filename || "").toLowerCase();
        const fontExt = new Set([
          ".woff",
          ".woff2",
          ".ttf",
          ".otf",
          ".eot",
        ]);
        const isFont =
          fontExt.has(fileExt) ||
          part.mimetype.startsWith("font/") ||
          part.mimetype.includes("font");
        const isImage = part.mimetype.startsWith("image/");
        if (
          !allowed.has(part.mimetype) &&
          !(part.mimetype === "application/octet-stream" && (isFont || isImage))
        ) {
          part.file.resume();
          return reply.code(400).send({
            error:
              "Only JPEG, PNG, GIF, WebP images or web fonts (woff/ttf) allowed",
          });
        }
        if (part.mimetype === "application/octet-stream" && !isFont && !isImage) {
          part.file.resume();
          return reply.code(400).send({
            error:
              "Only JPEG, PNG, GIF, WebP images or web fonts (woff/ttf) allowed",
          });
        }

        const ext =
          fileExt ||
          (part.mimetype === "image/png"
            ? ".png"
            : part.mimetype === "image/webp"
              ? ".webp"
              : part.mimetype === "image/gif"
                ? ".gif"
                : part.mimetype.includes("woff2")
                  ? ".woff2"
                  : part.mimetype.includes("woff")
                    ? ".woff"
                    : part.mimetype.includes("ttf")
                      ? ".ttf"
                      : part.mimetype.includes("otf")
                        ? ".otf"
                        : ".jpg");

        const folder =
          kind === "compiled"
            ? "compiled"
            : kind === "override"
              ? "override"
              : "source";
        const safeName =
          kind === "compiled"
            ? `preview-${Date.now()}${ext}`
            : `${randomUUID()}${ext}`;
        const storageKey = path
          .join("templates", id, folder, safeName)
          .replace(/\\/g, "/");
        const dir = await ensureUploadsDir("templates", id, folder);
        const absPath = path.join(dir, safeName);

        await pipeline(part.file, createWriteStream(absPath));
        saved = {
          absPath,
          storageKey,
          fileName: part.filename || safeName,
          mimeType: part.mimetype,
          safeName,
        };
      }

      if (!saved) {
        return reply.code(400).send({ error: "Expected multipart file field" });
      }

      // Non-owners may only attach compose replacement images (override).
      if (kind === "override") {
        if (!canComposeTemplate(existing, user)) {
          await unlink(saved.absPath).catch(() => undefined);
          return reply.code(404).send({ error: "Template not found" });
        }
      } else if (!canEdit(existing, user)) {
        await unlink(saved.absPath).catch(() => undefined);
        return reply.code(404).send({ error: "Template not found" });
      }

      const maxBytes = 5 * 1024 * 1024;
      const fileStat = await stat(saved.absPath);
      if (fileStat.size > maxBytes) {
        await unlink(saved.absPath);
        return reply.code(400).send({
          error:
            kind === "compiled"
              ? "Compiled image is too large - simplify the design"
              : "Image must be 5MB or smaller",
        });
      }

      if (kind === "compiled") {
        const old = await prisma.templateAsset.findMany({
          where: { templateId: id, kind: "compiled" },
        });
        for (const row of old) {
          await removeUploadFile(row.storageKey);
        }
        if (old.length) {
          await prisma.templateAsset.deleteMany({
            where: { templateId: id, kind: "compiled" },
          });
        }
      }

      // Compose slot replacements — only replace prior file for THIS exact
      // override stem (shared vs per-recipient must not delete each other).
      if (kind === "override") {
        // e.g. img-hero-override-shared-482x300.png
        //      img-hero-override-r-alex-at-ex-com-482x300.png
        const stem =
          saved.fileName
            .replace(/\.[^.]+$/i, "")
            .replace(/-\d+x\d+$/i, "")
            .trim() || null;
        if (stem) {
          const old = await prisma.templateAsset.findMany({
            where: {
              templateId: id,
              kind: "override",
              OR: [
                { fileName: { startsWith: `${stem}-` } },
                { fileName: { startsWith: stem } },
              ],
            },
          });
          const toRemove = old.filter((row) => {
            const rowStem = row.fileName
              .replace(/\.[^.]+$/i, "")
              .replace(/-\d+x\d+$/i, "");
            return rowStem.toLowerCase() === stem.toLowerCase();
          });
          for (const row of toRemove) {
            await removeUploadFile(row.storageKey);
          }
          if (toRemove.length) {
            await prisma.templateAsset.deleteMany({
              where: { id: { in: toRemove.map((r) => r.id) } },
            });
          }
        }
      }

      const asset = await prisma.templateAsset.create({
        data: {
          templateId: id,
          fileName: kind === "compiled" ? saved.safeName : saved.fileName,
          mimeType: saved.mimeType,
          byteSize: fileStat.size,
          storageKey: saved.storageKey,
          kind,
        },
      });

      await writeAudit({
        actorId: user.id,
        action: "template.asset_uploaded",
        entityType: "template",
        entityId: id,
        payload: {
          assetId: asset.id,
          byteSize: fileStat.size,
          mimeType: saved.mimeType,
          kind,
        },
      });

      return reply.code(201).send({
        asset: {
          ...asset,
          url: `${config.publicApiUrl}${publicUploadUrl(asset.storageKey)}`,
          suggestedHtml:
            kind === "source" ? suggestedImgTag(asset.fileName) : undefined,
        },
      });
    },
  );

  app.delete(
    "/templates/:id/assets/:assetId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.appUser!;
      const { id, assetId } = request.params as { id: string; assetId: string };
      const query = request.query as { invalidateCompiled?: string };
      const invalidateCompiled =
        query.invalidateCompiled === "1" ||
        query.invalidateCompiled === "true";

      const existing = await prisma.template.findUnique({ where: { id } });
      if (!existing || !canEdit(existing, user)) {
        return reply.code(404).send({ error: "Template not found" });
      }

      const asset = await prisma.templateAsset.findFirst({
        where: { id: assetId, templateId: id },
      });
      if (!asset) {
        return reply.code(404).send({ error: "Image not found" });
      }

      await removeUploadFile(asset.storageKey);
      await prisma.templateAsset.delete({ where: { id: assetId } });

      if (invalidateCompiled) {
        const compiled = await prisma.templateAsset.findMany({
          where: { templateId: id, kind: "compiled" },
        });
        for (const c of compiled) {
          await removeUploadFile(c.storageKey);
        }
        if (compiled.length) {
          await prisma.templateAsset.deleteMany({
            where: { templateId: id, kind: "compiled" },
          });
        }
      }

      await writeAudit({
        actorId: user.id,
        action: "template.asset_deleted",
        entityType: "template",
        entityId: id,
        payload: {
          assetId,
          fileName: asset.fileName,
          invalidateCompiled,
        },
      });

      return reply.code(204).send();
    },
  );

  app.post(
    "/templates/:id/assets/purge-compiled",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.appUser!;
      const { id } = request.params as { id: string };

      const existing = await prisma.template.findUnique({ where: { id } });
      if (!existing || !canEdit(existing, user)) {
        return reply.code(404).send({ error: "Template not found" });
      }

      const compiled = await prisma.templateAsset.findMany({
        where: { templateId: id, kind: "compiled" },
      });
      for (const c of compiled) {
        await removeUploadFile(c.storageKey);
      }
      if (compiled.length) {
        await prisma.templateAsset.deleteMany({
          where: { templateId: id, kind: "compiled" },
        });
      }

      await writeAudit({
        actorId: user.id,
        action: "template.compiled_purged",
        entityType: "template",
        entityId: id,
        payload: { removed: compiled.length },
      });

      return reply.send({ removed: compiled.length });
    },
  );

  app.delete(
    "/templates/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.appUser!;
      const { id } = request.params as { id: string };
      const existing = await prisma.template.findUnique({ where: { id } });
      if (!existing || !canEdit(existing, user)) {
        return reply.code(404).send({ error: "Template not found" });
      }

      const assets = await prisma.templateAsset.findMany({
        where: { templateId: id },
      });
      for (const asset of assets) {
        await removeUploadFile(asset.storageKey);
      }

      // Keep DraftJob / OutboundDraft rows for Sent history (FKs SetNull).
      await prisma.template.delete({ where: { id } });
      await writeAudit({
        actorId: user.id,
        action: "template.deleted",
        entityType: "template",
        entityId: id,
        payload: { name: existing.name },
      });

      return reply.code(204).send();
    },
  );
};
