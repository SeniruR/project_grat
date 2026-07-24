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
 * Creates Outlook drafts via Microsoft Graph.
 * - With delegated `accessToken`: POST /me/messages
 * - Otherwise (app credentials): POST /users/{upn}/messages
 *   (needs Application permission Mail.ReadWrite + admin consent)
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

    const accessToken =
      input.accessToken?.trim() || (await getGraphAppToken());
    const path = input.accessToken?.trim()
      ? "/me/messages"
      : mailboxUserPath(input.senderEmail ?? "");

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
