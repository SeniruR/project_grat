import { config } from "../../config.js";
import {
  getGraphAppToken,
  graphFetch,
  assertGraphMailConfig,
} from "../graph/client.js";
import type { CreateDraftInput, CreateDraftResult, MailProvider } from "./types.js";

type GraphMessage = {
  id?: string;
};

function mailboxUserPath(senderEmail: string) {
  const override = config.graphMailboxUpn?.trim();
  const upn = (override || senderEmail).trim();
  if (!upn) {
    throw new Error(
      "No sender mailbox for Graph drafts. Set GRAPH_MAILBOX_UPN or use a real user email.",
    );
  }
  return `/users/${encodeURIComponent(upn)}/messages`;
}

/**
 * Microsoft Graph mail.
 * - With the signed-in user's token: send from that mailbox (`Mail.Send`).
 * - Without it: create an Outlook draft with the app credential (`Mail.ReadWrite`).
 */
export const graphMailProvider: MailProvider = {
  mode: "graph",

  async createDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
    assertGraphMailConfig();

    const payload = {
      subject: input.subject,
      body: {
        contentType: "HTML",
        content: input.bodyHtml,
      },
      toRecipients: [
        {
          emailAddress: {
            address: input.recipientEmail,
            name: input.recipientName || input.recipientEmail,
          },
        },
      ],
    };

    const delegated = input.accessToken?.trim();
    if (delegated) {
      const attachments = (input.inlineAttachments ?? []).map((file) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: file.filename,
        contentType: file.contentType ?? "application/octet-stream",
        contentBytes: file.content.toString("base64"),
        isInline: true,
        contentId: file.cid,
      }));
      await graphFetch<unknown>("/me/sendMail", {
        method: "POST",
        accessToken: delegated,
        body: {
          message: {
            ...payload,
            ...(attachments.length ? { attachments } : {}),
          },
          saveToSentItems: true,
        },
      });
      return {
        mode: "graph",
        draftId: `sent-${Date.now()}`,
        sent: true,
      };
    }

    const accessToken = await getGraphAppToken();
    const path = mailboxUserPath(input.senderEmail ?? "");

    const message = await graphFetch<GraphMessage>(path, {
      method: "POST",
      accessToken,
      body: payload,
    });

    if (!message.id) {
      throw new Error("Graph created a message without an id");
    }

    return {
      mode: "graph",
      draftId: message.id,
      graphMessageId: message.id,
    };
  },
};
