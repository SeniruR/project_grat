import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { buildOutboundBodyHtml, parsePlaceholdersFromDesignJson } from "../lib/emailBody.js";
import { embedLocalUploadImages } from "../lib/embedEmailImages.js";
import { config } from "../config.js";
import { getMailProvider } from "../providers/mail/index.js";

const recipientBody = z.object({
  aadOid: z.string().min(1).max(200).optional(),
  email: z.string().email().max(320),
  displayName: z.string().min(1).max(200).optional(),
  /** Per-recipient custom merge values (e.g. personalNote). */
  fields: z.record(z.string().max(80), z.string().max(2000)).optional(),
});

const createJobBody = z.object({
  templateId: z.string().min(1),
  templateVersionId: z.string().min(1).optional(),
  subject: z.string().min(1).max(300),
  recipients: z.array(recipientBody).min(1).max(50),
  /** Optional override for {{senderName}} (defaults to signed-in user). */
  senderName: z.string().min(1).max(200).optional(),
  /** Optional override for {{senderEmail}} (defaults to signed-in user). */
  senderEmail: z.string().email().max(320).optional(),
  /** Shared merge values for every recipient (eventName, eventDate, …). */
  sharedFields: z.record(z.string().max(80), z.string().max(2000)).optional(),
});

function canView(
  template: { ownerId: string; visibility: string },
  user: { id: string; role: string },
) {
  return (
    template.ownerId === user.id ||
    template.visibility === "SHARED" ||
    user.role === "ADMIN"
  );
}

const draftSelect = {
  id: true,
  recipientOid: true,
  recipientEmail: true,
  recipientName: true,
  subject: true,
  bodyHtml: true,
  graphMessageId: true,
  status: true,
  error: true,
  createdAt: true,
} as const;

const jobInclude = {
  template: { select: { id: true, name: true } },
  templateVersion: { select: { id: true, version: true } },
  drafts: { orderBy: { createdAt: "asc" as const }, select: draftSelect },
  requester: {
    select: { id: true, displayName: true, email: true },
  },
} as const;

export const draftRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/draft-jobs",
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = request.appUser!;
      const jobs = await prisma.draftJob.findMany({
        where: user.role === "ADMIN" ? {} : { requesterId: user.id },
        orderBy: { createdAt: "desc" },
        take: 40,
        include: {
          template: { select: { id: true, name: true } },
          templateVersion: { select: { id: true, version: true } },
          _count: { select: { drafts: true } },
        },
      });
      return { jobs, mailMode: config.mailMode };
    },
  );

  app.get(
    "/draft-jobs/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.appUser!;
      const { id } = request.params as { id: string };
      const job = await prisma.draftJob.findUnique({
        where: { id },
        include: jobInclude,
      });
      if (!job) {
        return reply.code(404).send({ error: "Draft job not found" });
      }
      if (job.requesterId !== user.id && user.role !== "ADMIN") {
        return reply.code(403).send({ error: "Not allowed to view this job" });
      }
      return { job, mailMode: config.mailMode };
    },
  );

  app.post(
    "/draft-jobs",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.appUser!;
      const parsed = createJobBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid draft job payload" });
      }

      const {
        templateId,
        templateVersionId,
        subject,
        recipients,
        senderName,
        senderEmail,
        sharedFields,
      } = parsed.data;

      const sender = {
        displayName: senderName?.trim() || user.displayName,
        email: senderEmail?.trim() || user.email,
      };
      const shared = sharedFields ?? {};

      // Dedupe by email (case-insensitive)
      const seen = new Set<string>();
      const uniqueRecipients = recipients.filter((r) => {
        const key = r.email.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const template = await prisma.template.findUnique({
        where: { id: templateId },
        include: {
          assets: {
            where: { kind: "source" },
            select: { fileName: true, storageKey: true },
          },
        },
      });

      if (!template || !canView(template, user)) {
        return reply.code(404).send({ error: "Template not found" });
      }

      const version = templateVersionId
        ? await prisma.templateVersion.findFirst({
            where: { id: templateVersionId, templateId },
          })
        : await prisma.templateVersion.findFirst({
            where: { templateId },
            orderBy: { version: "desc" },
          });

      if (!version) {
        return reply.code(400).send({ error: "Template version not found" });
      }

      const compiled = (version.compiledHtml ?? "").trim();
      if (!compiled) {
        return reply.code(400).send({
          error:
            "This template has no compiled email HTML yet. Import a Canva ZIP (or HTML) first.",
        });
      }

      const placeholders = parsePlaceholdersFromDesignJson(version.designJson);

      const mail = await getMailProvider();
      const job = await prisma.draftJob.create({
        data: {
          requesterId: user.id,
          templateId: template.id,
          templateVersionId: version.id,
          status: "running",
          total: uniqueRecipients.length,
          completed: 0,
        },
      });

      let completed = 0;
      const draftRows: Array<{
        id: string;
        status: string;
        recipientEmail: string;
      }> = [];

      for (const recipient of uniqueRecipients) {
        let bodyHtml = buildOutboundBodyHtml({
          compiledHtml: compiled,
          headerHtml: template.headerHtml,
          footerHtml: template.footerHtml,
          assets: template.assets,
          publicBaseUrl: config.publicApiUrl,
          recipient: {
            displayName: recipient.displayName,
            email: recipient.email,
          },
          sender,
          placeholders,
          shared,
          perRecipient: recipient.fields ?? {},
        });

        let inlineAttachments:
          | Awaited<ReturnType<typeof embedLocalUploadImages>>["attachments"]
          | undefined;
        if (mail.mode === "smtp") {
          const embedded = await embedLocalUploadImages(
            bodyHtml,
            config.publicApiUrl,
          );
          bodyHtml = embedded.html;
          inlineAttachments = embedded.attachments;
        }

        try {
          const result = await mail.createDraft({
            senderUserId: user.id,
            senderEmail: user.email,
            recipientEmail: recipient.email,
            recipientName: recipient.displayName,
            recipientOid: recipient.aadOid,
            subject,
            bodyHtml,
            inlineAttachments,
          });

          const draft = await prisma.outboundDraft.create({
            data: {
              jobId: job.id,
              recipientOid: recipient.aadOid ?? null,
              recipientEmail: recipient.email,
              recipientName: recipient.displayName ?? null,
              subject,
              bodyHtml,
              graphMessageId:
                result.graphMessageId ??
                (result.mode === "smtp" ? result.smtpMessageId : undefined) ??
                result.draftId,
              status:
                result.mode === "mock"
                  ? "mock_created"
                  : result.mode === "graph"
                    ? "graph_draft"
                    : "smtp_sent",
            },
          });
          draftRows.push({
            id: draft.id,
            status: draft.status,
            recipientEmail: draft.recipientEmail,
          });
          completed += 1;
          await prisma.draftJob.update({
            where: { id: job.id },
            data: { completed },
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to create draft";
          const draft = await prisma.outboundDraft.create({
            data: {
              jobId: job.id,
              recipientOid: recipient.aadOid ?? null,
              recipientEmail: recipient.email,
              recipientName: recipient.displayName ?? null,
              subject,
              bodyHtml,
              status: "failed",
              error: message,
            },
          });
          draftRows.push({
            id: draft.id,
            status: draft.status,
            recipientEmail: draft.recipientEmail,
          });
          completed += 1;
          await prisma.draftJob.update({
            where: { id: job.id },
            data: { completed },
          });
        }
      }

      const failed = draftRows.filter((d) => d.status === "failed").length;
      const status =
        failed === 0
          ? "completed"
          : failed === draftRows.length
            ? "failed"
            : "completed_with_errors";

      const updated = await prisma.draftJob.update({
        where: { id: job.id },
        data: { status, completed },
        include: jobInclude,
      });

      await writeAudit({
        actorId: user.id,
        action: "draft_job.created",
        entityType: "DraftJob",
        entityId: job.id,
        payload: {
          templateId: template.id,
          version: version.version,
          total: uniqueRecipients.length,
          failed,
          mailMode: mail.mode,
        },
      });

      return reply.code(201).send({ job: updated, mailMode: mail.mode });
    },
  );
};
