import { config } from "../../config.js";
import { mockMailProvider } from "./mock.js";
import { graphMailProvider } from "./graph.js";
import type { MailProvider } from "./types.js";

export function getMailProvider(): MailProvider {
  if (config.mailMode === "graph") {
    return graphMailProvider;
  }
  return mockMailProvider;
}

export type { CreateDraftInput, CreateDraftResult, MailProvider } from "./types.js";
