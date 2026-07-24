import type { FastifyPluginAsync } from "fastify";

export const catalogRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/catalog",
    { preHandler: [app.authenticate] },
    async () => ({
      items: [
        {
          type: "CARD",
          title: "Gratitude cards",
          description: "Design templates and copy appreciation emails for Outlook.",
          available: true,
        },
        {
          type: "GIFT",
          title: "Gifts",
          description: "Coming later.",
          available: false,
        },
      ],
    }),
  );
};
