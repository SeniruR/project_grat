import type { CreateDraftInput, CreateDraftResult, MailProvider } from "./types.js";
import { randomUUID } from "node:crypto";

/** Placeholder until Phase 3 wires Graph drafts + outbound_drafts. */
export const mockMailProvider: MailProvider = {
  mode: "mock",

  async createDraft(_input: CreateDraftInput): Promise<CreateDraftResult> {
    return {
      mode: "mock",
      draftId: `mock-${randomUUID()}`,
    };
  },
};
