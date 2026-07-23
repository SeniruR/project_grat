import { prisma } from "../../db.js";
import type { DirectoryPerson, DirectoryProvider } from "./types.js";

export const mockDirectoryProvider: DirectoryProvider = {
  mode: "mock",

  async search(query: string, limit = 20): Promise<DirectoryPerson[]> {
    const q = query.trim();
    const users = await prisma.user.findMany({
      where: {
        isDirectory: true,
        ...(q
          ? {
              OR: [
                { displayName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      take: limit,
      orderBy: { displayName: "asc" },
    });

    return users.map((u) => ({
      aadOid: u.aadOid,
      email: u.email,
      displayName: u.displayName,
    }));
  },
};
