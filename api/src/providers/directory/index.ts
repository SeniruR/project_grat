import { config } from "../../config.js";
import { graphDirectoryProvider } from "./graph.js";
import { mockDirectoryProvider } from "./mock.js";
import type { DirectoryProvider } from "./types.js";

export function getDirectoryProvider(): DirectoryProvider {
  if (config.directoryMode === "graph") return graphDirectoryProvider;
  return mockDirectoryProvider;
}

export type { DirectoryPerson, DirectoryProvider } from "./types.js";
