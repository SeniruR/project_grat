export type CreateDraftInput = {
  senderUserId: string;
  /** Signed-in person's address. Shown as the From address. */
  senderEmail?: string;
  /** Signed-in person's name. Shown as the From name. */
  senderName?: string;
  /** Delegated Graph token — when set, uses /me/messages instead of app mailbox */
  accessToken?: string;
  recipientEmail: string;
  recipientName?: string;
  recipientOid?: string;
  subject: string;
  bodyHtml: string;
  /** SMTP inline images (cid:) */
  inlineAttachments?: Array<{
    cid: string;
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

export type CreateDraftResult = {
  mode: "mock" | "graph" | "smtp";
  draftId: string;
  graphMessageId?: string;
  smtpMessageId?: string;
};

/**
 * Mock: returns a fake draft id (DB persistence is in draft-jobs routes).
 * Graph: creates a real Outlook draft via Microsoft Graph.
 * SMTP: sends HTML email (e.g. Gmail SMTP).
 */
export interface MailProvider {
  readonly mode: "mock" | "graph" | "smtp";
  createDraft(input: CreateDraftInput): Promise<CreateDraftResult>;
}
