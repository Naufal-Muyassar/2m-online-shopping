import { Router } from "express";
import { z } from "zod";
import { createOrderRequestSchema, type CreateOrderRequest } from "@2m/shared";
import { pool } from "../../shared/db";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate, requireRole } from "../auth/middleware";
import * as customer from "./customer";

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
  asyncHandler(async (req, res) => {
    res.json({ orders: await customer.listCustomerOrders(pool, req.auth!.sub) });
  }),
);

ordersRoutes.get(
  "/:id",
  authenticate,
  requireRole("customer"),
  validate(z.object({ id: z.string().uuid() }), "params"),
  asyncHandler(async (req, res) => {
    res.json({ order: await customer.getCustomerOrder(req.auth!.sub, req.params.id as string) });
  }),
);
