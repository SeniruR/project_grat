import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { getAuthProvider } from "../providers/auth/index.js";
import { DevLoginRejected } from "../providers/auth/types.js";
import {
  AzureNotConfigured,
  azureAuthorizeUrl,
  exchangeAzureCode,
} from "../providers/azure/oauth.js";
import {
  profileFromAzureTokens,
  upsertAzureUser,
} from "../providers/azure/session.js";

function azureWebRedirect(hash: string) {
  const origin = config.azureWebOrigin.replace(/\/$/, "");
  return `${origin}/login#${hash}`;
}

const loginBody = z.object({
  email: z.string().email(),
  employeeNumber: z.string().trim().min(1).max(20),
  role: z.enum(["USER", "DESIGNER", "ADMIN"]).optional(),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/auth/azure/start", async (_request, reply) => {
    try {
      return reply.redirect(azureAuthorizeUrl());
    } catch (err) {
      const message =
        err instanceof AzureNotConfigured
          ? err.message
          : err instanceof Error
            ? err.message
            : "Azure sign-in could not start";
      return reply.code(503).type("text/html").send(
        `<!doctype html><meta charset="utf-8"><title>Azure sign-in</title><p>${message.replace(/</g, "")}</p>`,
      );
    }
  });

  app.get("/auth/azure/callback", async (request, reply) => {
    const query = z
      .object({
        code: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
        error_description: z.string().optional(),
      })
      .parse(request.query);

    const fail = (message: string) =>
      reply.redirect(
        azureWebRedirect(`azure_error=${encodeURIComponent(message.slice(0, 300))}`),
      );

    if (query.error) {
      return fail(query.error_description || query.error);
    }
    if (!query.code || !query.state) {
      return fail("Azure did not return a sign-in code.");
    }

    try {
      const tokens = await exchangeAzureCode(query.code, query.state);
      const profile = await profileFromAzureTokens(
        tokens.access_token!,
        tokens.id_token!,
      );
      const user = await upsertAzureUser(profile, tokens.refresh_token!);
      const token = await reply.jwtSign({ sub: user.id, role: user.role });
      return reply.redirect(
        azureWebRedirect(`token=${encodeURIComponent(token)}`),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Azure sign-in failed";
      return fail(message);
    }
  });

  app.get("/auth/mode", async () => ({
    authMode: config.authMode,
    directoryMode: config.directoryMode,
    mailMode: config.mailMode,
    azureReady: config.azureReady,
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

    let user;
    try {
      user = await provider.loginDev(parsed.data);
    } catch (err) {
      if (err instanceof DevLoginRejected) {
        return reply.code(401).send({ error: err.message });
      }
      throw err;
    }
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
