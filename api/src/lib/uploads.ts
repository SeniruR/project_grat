import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** api/uploads — local stand-in for blob storage */
export const uploadsRoot = path.resolve(__dirname, "../../uploads");

export async function ensureUploadsDir(...parts: string[]) {
  const dir = path.join(uploadsRoot, ...parts);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function publicUploadUrl(storageKey: string) {
  return `/uploads/${storageKey.replace(/\\/g, "/")}`;
}

export function absoluteUploadPath(storageKey: string) {
  return path.join(uploadsRoot, ...storageKey.split("/"));
}

export async function removeUploadFile(storageKey: string) {
  try {
    await unlink(absoluteUploadPath(storageKey));
  } catch {
    // ignore missing files
  }
}
