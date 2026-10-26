import { Router } from "express";
import { metaConfigResponseSchema } from "@2m/shared";
import { env } from "../../config/env";

export const metaRoutes = Router();

metaRoutes.get("/config", (_req, res) => {
  res.json(metaConfigResponseSchema.parse({ demo_mode: env.DEMO_MODE }));
});
