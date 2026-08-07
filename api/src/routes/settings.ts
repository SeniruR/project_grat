import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import {
  DEFAULT_NAME_HONORIFICS,
  NAME_HONORIFICS_SETTING_KEY,
  normalizeNameHonorifics,
} from "../lib/nameHonorifics.js";

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  /** Compose name-title dropdown options (admin-configurable). */
  app.get(
    "/settings/name-honorifics",
    { preHandler: [app.authenticate] },
    async () => {
      const row = await prisma.appSetting.findUnique({
        where: { key: NAME_HONORIFICS_SETTING_KEY },
      });
      const honorifics = row
        ? normalizeNameHonorifics(row.value)
        : [...DEFAULT_NAME_HONORIFICS];
      return { honorifics };
    },
  );
};
