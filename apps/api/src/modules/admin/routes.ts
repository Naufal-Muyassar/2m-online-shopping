import { Router } from "express";
import {
  adminBranchQuerySchema,
  adminTransitionRequestSchema,
  forcePaidRequestSchema,
  orderIdParamsSchema,
  type AdminTransitionRequest,
  type ForcePaidRequest,
} from "@2m/shared";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate, branchScope, requireRole } from "../auth/middleware";
import * as service from "./service";

export const adminRoutes = Router();

adminRoutes.get(
  "/orders",
  authenticate,
  requireRole("branch_admin", "super_admin"),
  validate(adminBranchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await service.boardOrders(branchScope(req)));
  }),
);

adminRoutes.get(
  "/couriers",
  authenticate,
  requireRole("branch_admin", "super_admin"),
  validate(adminBranchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await service.branchCouriers(branchScope(req)));
  }),
);

adminRoutes.post(
  "/orders/:id/confirm-return",
  authenticate,
  requireRole("branch_admin"),
  validate(orderIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    res.json(
      await service.confirmReturn({
        orderId: req.params.id as string,
        adminId: req.auth!.sub,
        branchId: branchScope(req),
      }),
    );
  }),
);

adminRoutes.post(
  "/orders/:id/transition",
  authenticate,
  requireRole("branch_admin"),
  validate(orderIdParamsSchema, "params"),
  validate(adminTransitionRequestSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as AdminTransitionRequest;
    const result = await service.adminTransition({
      orderId: req.params.id as string,
      to: body.to,
      adminId: req.auth!.sub,
      branchId: branchScope(req),
      idempotencyKey: body.idempotency_key,
    });
    res.json(result);
  }),
);

adminRoutes.post(
  "/orders/:id/force-paid",
  authenticate,
  requireRole("super_admin"),
  validate(orderIdParamsSchema, "params"),
  validate(forcePaidRequestSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as ForcePaidRequest;
    const result = await service.forcePaid({
      orderId: req.params.id as string,
      adminId: req.auth!.sub,
      idempotencyKey: body.idempotency_key,
    });
    res.json(result);
  }),
);
