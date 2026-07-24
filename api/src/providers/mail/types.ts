export type CreateDraftInput = {
  senderUserId: string;
  /** Mailbox UPN/email when using app-only Graph (/users/{upn}/messages) */
  senderEmail?: string;
  /** Delegated Graph token — when set, uses /me/messages instead of app mailbox */
  accessToken?: string;
  recipientEmail: string;
  recipientName?: string;
  recipientOid?: string;
  subject: string;
  bodyHtml: string;
};

export type CreateDraftResult = {
  mode: "mock" | "graph";
  draftId: string;
  graphMessageId?: string;
};

/**
 * Mock: returns a fake draft id (DB persistence is in draft-jobs routes).
 * Graph: creates a real Outlook draft via Microsoft Graph.
 */
export interface MailProvider {
  readonly mode: "mock" | "graph";
  createDraft(input: CreateDraftInput): Promise<CreateDraftResult>;
}
