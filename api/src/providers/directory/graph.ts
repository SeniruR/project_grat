import { graphFetch } from "../graph/client.js";
import type { DirectoryPerson, DirectoryProvider } from "./types.js";

type GraphUser = {
  id?: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName?: string | null;
};

function safeQuery(query: string) {
  return query.replace(/["\\]/g, "").trim();
}

/**
 * `@example.com` searches that mail domain.
 * A name or address fragment uses Graph $search.
 */
function searchPath(query: string, limit: number) {
  const q = safeQuery(query);
  const params = new URLSearchParams();
  params.set("$select", "id,displayName,mail,userPrincipalName");
  params.set("$top", String(limit));
  params.set("$count", "true");

  if (q.startsWith("@") && !q.slice(1).includes("@") && !q.includes(" ")) {
    const domain = q.slice(1).replace(/'/g, "");
    params.set("$filter", `endswith(mail,'@${domain}')`);
  } else {
    params.set(
      "$search",
      `"displayName:${q}" OR "mail:${q}" OR "userPrincipalName:${q}"`,
    );
  }
  return `/users?${params.toString()}`;
}

export const graphDirectoryProvider: DirectoryProvider = {
  mode: "graph",

  async search(query, limit = 20, accessToken?: string): Promise<DirectoryPerson[]> {
    const q = query.trim();
    if (!q) return [];
    if (!accessToken) {
      throw new Error(
        "Company directory search needs an Azure AD sign-in. Sign in with your work account.",
      );
    }

    const data = await graphFetch<{ value?: GraphUser[] }>(searchPath(q, limit), {
      accessToken,
      headers: { ConsistencyLevel: "eventual" },
    });

    const people: DirectoryPerson[] = [];
    for (const user of data?.value ?? []) {
      const email = (user.mail || user.userPrincipalName || "").trim().toLowerCase();
      if (!user.id || !email) continue;
      people.push({
        aadOid: user.id,
        email,
        displayName: (user.displayName || email).trim(),
      });
    }
    return people;
  },
};
