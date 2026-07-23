import { config } from "../../config.js";
import { mockDirectoryProvider } from "./mock.js";
import type { DirectoryProvider } from "./types.js";

export function getDirectoryProvider(): DirectoryProvider {
  if (config.directoryMode === "graph") {
    throw new Error(
      "DIRECTORY_MODE=graph is not wired yet. Keep DIRECTORY_MODE=mock for now.",
    );
  }
  return mockDirectoryProvider;
}

export type { DirectoryPerson, DirectoryProvider } from "./types.js";
