export type CreateDraftInput = {
  senderUserId: string;
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
 * Dev: persist mock drafts in DB.
 * Later: Microsoft Graph create message as draft in /me.
 */
export interface MailProvider {
  readonly mode: "mock" | "graph";
  createDraft(input: CreateDraftInput): Promise<CreateDraftResult>;
}
