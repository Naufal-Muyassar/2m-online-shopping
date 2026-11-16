import { Router } from "express";
import { z } from "zod";
import {
  createOrderRequestSchema,
  orderListQuerySchema,
  refundDestinationRequestSchema,
  refundParamsSchema,
  type CreateOrderRequest,
  type OrderListQuery,
  type RefundDestinationRequest,
} from "@2m/shared";
import { pool } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate, requireRole } from "../auth/middleware";
import * as customer from "./customer";
import { IDEMPOTENCY_HEADER } from "./idempotency";
import * as tracking from "./tracking";
import * as refunds from "../refunds/service";

export const ordersRoutes = Router();

const idempotencyKeySchema = z.string().uuid();

ordersRoutes.post(
  "/",
  authenticate,
  requireRole("customer"),
  validate(createOrderRequestSchema),
  asyncHandler(async (req, res) => {
    const key = idempotencyKeySchema.safeParse(req.get(IDEMPOTENCY_HEADER));
    if (!key.success) {
      throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Send a UUID in the Idempotency-Key header, the same one on every retry");
    }
    const { order, replayed } = await customer.createOrder(req.auth!.sub, req.body as CreateOrderRequest, key.data);
    if (replayed) res.setHeader("Idempotent-Replayed", "true");
    res.status(replayed ? 200 : 201).json({ order });
  }),
);

ordersRoutes.get(
  "/",
  authenticate,
  requireRole("customer"),
  validate(orderListQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { cursor, limit } = req.query as unknown as OrderListQuery;
    res.json(await customer.listCustomerOrders(pool, req.auth!.sub, { cursor, limit }));
  }),
);

ordersRoutes.get(
  "/:id",
  authenticate,
  requireRole("customer"),
  validate(z.object({ id: z.string().uuid() }), "params"),
  asyncHandler(async (req, res) => {
    res.json(await customer.getCustomerOrder(req.auth!.sub, req.params.id as string));
  }),
);

ordersRoutes.get(
  "/:id/tracking",
  authenticate,
  requireRole("customer"),
  validate(z.object({ id: z.string().uuid() }), "params"),
  asyncHandler(async (req, res) => {
    res.json(await tracking.getTracking(req.auth!.sub, req.params.id as string));
  }),
);
// The customer says where the refund should go. Allowed until the store has paid it out.
ordersRoutes.put(
  "/:id/refunds/:refundId/destination",
  authenticate,
  requireRole("customer"),
  validate(refundParamsSchema, "params"),
  validate(refundDestinationRequestSchema),
  asyncHandler(async (req, res) => {
    res.json({
      refund: await refunds.setDestination(
        req.auth!.sub,
        req.params.id as string,
        req.params.refundId as string,
        req.body as RefundDestinationRequest,
      ),
    });
  }),
);
