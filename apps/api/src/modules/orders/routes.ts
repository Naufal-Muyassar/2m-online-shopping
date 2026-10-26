import { Router } from "express";
import { z } from "zod";
import { createOrderRequestSchema, orderListQuerySchema, type CreateOrderRequest, type OrderListQuery } from "@2m/shared";
import { pool } from "../../shared/db";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate, requireRole } from "../auth/middleware";
import * as customer from "./customer";
import * as tracking from "./tracking";

export const ordersRoutes = Router();

ordersRoutes.post(
  "/",
  authenticate,
  requireRole("customer"),
  validate(createOrderRequestSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ order: await customer.createOrder(req.auth!.sub, req.body as CreateOrderRequest) });
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