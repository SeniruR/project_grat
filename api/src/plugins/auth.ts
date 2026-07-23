import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import type { AuthUser } from "../providers/auth/types.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: string };
    user: { sub: string; role: string };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    appUser?: AuthUser;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const authPluginImpl: FastifyPluginAsync = async (app) => {
  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
        const userId = request.user.sub;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
          return reply.code(401).send({ error: "User not found" });
        }
        request.appUser = {
          id: user.id,
          aadOid: user.aadOid,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
        };
      } catch {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    },
  );

  app.decorate(
    "requireAdmin",
    async (request: FastifyRequest, reply: FastifyReply) => {
      await app.authenticate(request, reply);
      if (reply.sent) return;
      if (request.appUser?.role !== "ADMIN") {
        return reply.code(403).send({ error: "Admin only" });
      }
    },
  );
};

/** Break encapsulation so authenticate/requireAdmin are visible to route plugins. */
export const authPlugin = fp(authPluginImpl, {
  name: "auth-plugin",
  dependencies: ["@fastify/jwt"],
});
