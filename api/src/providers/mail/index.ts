import { config } from "../../config.js";
import { mockMailProvider } from "./mock.js";
import { graphMailProvider } from "./graph.js";
import type { MailProvider } from "./types.js";

let smtpMailProvider: MailProvider | null = null;

/** Load SMTP provider on demand so mock/graph mode works without nodemailer installed. */
export async function getMailProvider(): Promise<MailProvider> {
  if (config.mailMode === "graph") {
    return graphMailProvider;
  }
  if (config.mailMode === "smtp") {
    if (!smtpMailProvider) {
      const mod = await import("./smtp.js");
      smtpMailProvider = mod.smtpMailProvider;
    }
    return smtpMailProvider;
  }
  return mockMailProvider;
}

export type { CreateDraftInput, CreateDraftResult, MailProvider } from "./types.js";
