import { prisma } from "../../db.js";
import type { DirectoryPerson, DirectoryProvider } from "./types.js";

/**
 * `@example.com` / `example.com` → that domain.
 * `@example` → every address on that name (`@example.com`, `@example.org`, …).
 */
function emailDomainFilter(query: string): { endsWith: string } | { contains: string } | null {
  const t = query.trim().toLowerCase();
  if (!t || t.includes(" ")) return null;
  const rest = t.startsWith("*@") ? t.slice(2) : t.startsWith("@") ? t.slice(1) : t;
  if (!rest || rest.includes("@")) return null;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(rest)) {
    return { endsWith: `@${rest}` };
  }
  if (t.startsWith("@") && /^[a-z0-9][a-z0-9.-]*$/i.test(rest)) {
    return { contains: `@${rest}` };
  }
  return null;
}

export const mockDirectoryProvider: DirectoryProvider = {
  mode: "mock",

  async search(query: string, limit = 20): Promise<DirectoryPerson[]> {
    const q = query.trim();
    const domain = emailDomainFilter(q);
    const users = await prisma.user.findMany({
      where: {
        isDirectory: true,
        ...(domain
          ? {
              email:
                "endsWith" in domain
                  ? { endsWith: domain.endsWith, mode: "insensitive" }
                  : { contains: domain.contains, mode: "insensitive" },
            }
          : q
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
