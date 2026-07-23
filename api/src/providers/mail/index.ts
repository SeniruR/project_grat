import { config } from "../../config.js";
import { mockMailProvider } from "./mock.js";
import type { MailProvider } from "./types.js";

export function getMailProvider(): MailProvider {
  if (config.mailMode === "graph") {
    throw new Error("MAIL_MODE=graph is not wired yet. Keep MAIL_MODE=mock for now.");
  }
  return mockMailProvider;
}

export type { CreateDraftInput, CreateDraftResult, MailProvider } from "./types.js";
