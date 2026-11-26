import { Router } from "express";
import {
  platformWalletManualRequestSchema,
  platformWalletQuerySchema,
  type PlatformWalletManualRequest,
  type PlatformWalletQuery,
} from "@2m/shared";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate, requireRole } from "../auth/middleware";
import * as service from "./service";

// Mounted at /admin/platform-wallet. The 2M wallet is head-office money, so only super_admin reads or writes it.
export const platformWalletRoutes = Router();

platformWalletRoutes.use(authenticate, requireRole("super_admin"));

platformWalletRoutes.get(
  "/",
  validate(platformWalletQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await service.overview(req.query as unknown as PlatformWalletQuery));
  }),
);

platformWalletRoutes.post(
  "/entries",
  validate(platformWalletManualRequestSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.recordManual(req.auth!.sub, req.body as PlatformWalletManualRequest));
  }),
);
