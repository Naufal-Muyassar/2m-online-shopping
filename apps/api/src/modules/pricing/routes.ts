import { Router } from "express";
import { calculatePriceRequestSchema, type CalculatePriceRequest, type PriceBreakdown } from "@2m/shared";
import { pool } from "../../shared/db";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate, requireRole } from "../auth/middleware";
import { quote } from "./service";

export const pricingRoutes = Router();

pricingRoutes.post(
  "/",
  authenticate,
  requireRole("customer"),
  validate(calculatePriceRequestSchema),
  asyncHandler(async (req, res) => {
    const q = await quote(pool, req.auth!.sub, req.body as CalculatePriceRequest);
    const body: PriceBreakdown = q.breakdown;
    res.json(body);
  }),
);
