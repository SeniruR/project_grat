import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { config } from "../../config.js";
import type { CreateDraftInput, CreateDraftResult, MailProvider } from "./types.js";

function assertSmtpConfig() {
  const missing: string[] = [];
  if (!config.smtpHost?.trim()) missing.push("SMTP_HOST");
  if (!config.smtpUser?.trim()) missing.push("SMTP_USER");
  if (!config.smtpPass?.trim()) missing.push("SMTP_PASS");
  if (missing.length) {
    throw new Error(
      `MAIL_MODE=smtp requires ${missing.join(", ")}. For Gmail use an App Password (not your login password).`,
    );
  }
}

let transporter: Transporter | null = null;

function getTransporter() {
  assertSmtpConfig();
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost!,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser!,
        pass: config.smtpPass!,
      },
    });
  }
  return transporter;
}

function fromAddress() {
  const user = config.smtpUser!.trim();
  const from = config.smtpFrom?.trim() || user;
  const name = config.smtpFromName?.trim();
  return name ? `"${name.replace(/"/g, "")}" <${from}>` : from;
}

function isFullHtmlDocument(html: string) {
  return /^\s*<!DOCTYPE\s+html/i.test(html) || /^\s*<html[\s>]/i.test(html);
}

/** Ensure nodemailer gets a complete HTML document. */
function toMimeHtml(bodyHtml: string) {
  const trimmed = bodyHtml.trim();
  if (!trimmed) return "<!DOCTYPE html><html><body></body></html>";
  if (isFullHtmlDocument(trimmed)) return trimmed;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
</head>
<body style="margin:0;padding:0;">
${trimmed}
</body>
</html>`;
}

/**
 * Sends HTML email via SMTP (Gmail-compatible).
 * Named createDraft to match the mail provider interface used by compose.
 */
export const smtpMailProvider: MailProvider = {
  mode: "smtp",

  async createDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
    const transport = getTransporter();
    const html = toMimeHtml(input.bodyHtml);
    const textFallback = html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);

    const info = await transport.sendMail({
      from: fromAddress(),
      to: input.recipientName
        ? `"${input.recipientName.replace(/"/g, "")}" <${input.recipientEmail}>`
        : input.recipientEmail,
      subject: input.subject,
      html,
      text: textFallback || input.subject,
      attachments: (input.inlineAttachments ?? []).map((a) => ({
        filename: a.filename,
        content: a.content,
        cid: a.cid,
        contentType: a.contentType,
      })),
    });

    const messageId =
      (typeof info.messageId === "string" && info.messageId) ||
      `smtp-${Date.now()}`;

    return {
      mode: "smtp",
      draftId: messageId,
      smtpMessageId: messageId,
    };
  },
};
