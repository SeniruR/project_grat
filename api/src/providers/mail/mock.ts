import type { CreateDraftInput, CreateDraftResult, MailProvider } from "./types.js";
import { randomUUID } from "node:crypto";

/** Mock Outlook drafts — persistence is owned by draft-jobs routes. */
export const mockMailProvider: MailProvider = {
  mode: "mock",

  async createDraft(_input: CreateDraftInput): Promise<CreateDraftResult> {
    return {
      mode: "mock",
      draftId: `mock-${randomUUID()}`,
    };
  },
};
