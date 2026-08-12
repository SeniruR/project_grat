import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { getAuthProvider } from "../providers/auth/index.js";

const loginBody = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  role: z.enum(["USER", "DESIGNER", "ADMIN"]).optional(),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/auth/mode", async () => ({
    authMode: config.authMode,
    directoryMode: config.directoryMode,
    mailMode: config.mailMode,
    ...(config.mailMode === "smtp"
      ? {
          smtpFrom:
            config.smtpFrom?.trim() || config.smtpUser?.trim() || null,
          smtpFromName: config.smtpFromName?.trim() || null,
        }
      : {}),
  }));

  app.post("/auth/dev-login", async (request, reply) => {
    if (config.authMode !== "dev") {
      return reply.code(400).send({
        error: "Dev login disabled. AUTH_MODE is not dev.",
      });
    }

    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid login payload" });
    }

    const provider = getAuthProvider();
    if (!provider.loginDev) {
      return reply.code(500).send({ error: "Dev login not available" });
    }

    const user = await provider.loginDev(parsed.data);
    const token = await reply.jwtSign({
      sub: user.id,
      role: user.role,
    });

    return { token, user };
  });

  app.get(
    "/auth/me",
    { preHandler: [app.authenticate] },
    async (request) => ({ user: request.appUser }),
  );
};
