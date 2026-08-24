import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { disconnectDb } from "./db.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { directoryRoutes } from "./routes/directory.js";
import { adminRoutes } from "./routes/admin.js";
import { catalogRoutes } from "./routes/catalog.js";
import { templateRoutes } from "./routes/templates.js";
import { draftRoutes } from "./routes/drafts.js";
import { marketplaceRoutes } from "./routes/marketplace.js";
import { categoryRoutes } from "./routes/categories.js";
import { settingsRoutes } from "./routes/settings.js";
import { ensureUploadsDir, uploadsRoot } from "./lib/uploads.js";

await ensureUploadsDir();

const app = Fastify({
  logger: true,
  bodyLimit: 5 * 1024 * 1024,
});

await app.register(cors, {
  origin: config.corsOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

await app.register(jwt, {
  secret: config.jwtSecret,
  sign: { expiresIn: "7d" },
});

await app.register(multipart, {
  // Compiled 2× PNG previews can exceed 2MB on detailed cards
  limits: { fileSize: 12 * 1024 * 1024 },
});

await app.register(fastifyStatic, {
  root: uploadsRoot,
  prefix: "/uploads/",
  decorateReply: false,
});

await app.register(authPlugin);
await app.register(authRoutes);
await app.register(directoryRoutes);
await app.register(adminRoutes);
await app.register(catalogRoutes);
await app.register(templateRoutes);
await app.register(draftRoutes);
await app.register(marketplaceRoutes);
await app.register(categoryRoutes);
await app.register(settingsRoutes);

app.get("/health", async () => ({
  ok: true,
  authMode: config.authMode,
  directoryMode: config.directoryMode,
  mailMode: config.mailMode,
}));

const shutdown = async () => {
  await app.close();
  await disconnectDb();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `API listening on http://localhost:${config.port} (auth=${config.authMode})`,
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
