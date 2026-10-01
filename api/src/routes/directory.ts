import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDelegatedGraphToken } from "../providers/azure/session.js";
import { getDirectoryProvider } from "../providers/directory/index.js";

export const directoryRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/directory/search",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const query = z
        .object({
          q: z.string().optional().default(""),
          limit: z.coerce.number().int().min(1).max(200).optional().default(20),
        })
        .parse(request.query);

      const provider = getDirectoryProvider();
      let accessToken: string | undefined;
      if (provider.mode === "graph") {
        try {
          accessToken = await getDelegatedGraphToken(request.appUser!.id);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Directory search failed";
          return reply.code(400).send({ error: message });
        }
      }
      const people = await provider.search(query.q, query.limit, accessToken);
      return { mode: provider.mode, people };
    },
  );
};
