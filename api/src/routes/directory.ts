import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDirectoryProvider } from "../providers/directory/index.js";

export const directoryRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/directory/search",
    { preHandler: [app.authenticate] },
    async (request) => {
      const query = z
        .object({
          q: z.string().optional().default(""),
          limit: z.coerce.number().int().min(1).max(50).optional().default(20),
        })
        .parse(request.query);

      const provider = getDirectoryProvider();
      const people = await provider.search(query.q, query.limit);
      return { mode: provider.mode, people };
    },
  );
};
