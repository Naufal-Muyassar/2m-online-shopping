import { Router } from "express";
import {
  adminAssignRequestSchema,
  adminBranchQuerySchema,
  adminCancelRequestSchema,
  adminOrdersQuerySchema,
  type AdminCancelRequest,
  type AdminOrdersQuery,
  adminReleaseRequestSchema,
  adminTransitionRequestSchema,
  courierIdParamsSchema,
  courierLedgerQuerySchema,
  courierWithdrawalRequestSchema,
  createCourierRequestSchema,
  type CreateCourierRequest,
  forcePaidRequestSchema,
  orderIdParamsSchema,
  type AdminAssignRequest,
  type AdminReleaseRequest,
  type AdminTransitionRequest,
  type CourierLedgerQuery,
  type CourierWithdrawalRequest,
  type ForcePaidRequest,
  withdrawalSlipParamsSchema,
} from "@2m/shared";
import { asyncHandler, sendPdf, validate } from "../../shared/http";
import { authenticate, branchScope, requireRole } from "../auth/middleware";
import * as earnings from "../earnings/service";
import { adminOrderRoute } from "../orders/tracking";
import * as service from "./service";

export const adminRoutes = Router();

adminRoutes.get(
  "/orders",
  authenticate,
  requireRole("branch_admin", "super_admin"),
  validate(adminOrdersQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { date } = req.query as unknown as AdminOrdersQuery;
    res.json(await service.boardOrders(branchScope(req), date));
  }),
);

adminRoutes.post(
  "/orders/:id/cancel",
  authenticate,
  requireRole("branch_admin", "super_admin"),
  validate(orderIdParamsSchema, "params"),
  validate(adminCancelRequestSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as AdminCancelRequest;
    res.json(
      await service.cancelOrder({
        orderId: req.params.id as string,
        reason: body.reason,
        actor: { id: req.auth!.sub, role: req.auth!.role as "branch_admin" | "super_admin" },
        branchId: branchScope(req),
        idempotencyKey: body.idempotency_key,
      }),
    );
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

adminRoutes.get(
  "/courier-partners",
  authenticate,
  requireRole("branch_admin", "super_admin"),
  asyncHandler(async (_req, res) => {
    res.json(await service.courierPartners());
  }),
);

adminRoutes.post(
  "/couriers",
  authenticate,
  requireRole("branch_admin", "super_admin"),
  validate(createCourierRequestSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(
      await service.createCourier({
        branchId: branchScope(req),
        actor: { id: req.auth!.sub, role: req.auth!.role as "branch_admin" | "super_admin" },
        body: req.body as CreateCourierRequest,
      }),
    );
  }),
);

adminRoutes.get(
  "/couriers/:id/releases",
  authenticate,
  requireRole("branch_admin", "super_admin"),
  validate(courierIdParamsSchema, "params"),
  validate(adminBranchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await service.courierReleases(req.params.id as string, branchScope(req)));
  }),
);

adminRoutes.get(
  "/couriers/:id/ledger",
  authenticate,
  requireRole("branch_admin", "super_admin"),
  validate(courierIdParamsSchema, "params"),
  validate(courierLedgerQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { cursor, limit } = req.query as unknown as CourierLedgerQuery;
    res.json(await earnings.branchCourierHistory(req.params.id as string, branchScope(req), { cursor, limit }));
  }),
);

// super_admin can view balances but not record a handover: the cash changes hands at the branch.
adminRoutes.post(
  "/couriers/:id/withdrawals",
  authenticate,
  requireRole("branch_admin"),
  validate(courierIdParamsSchema, "params"),
  validate(courierWithdrawalRequestSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as CourierWithdrawalRequest;
    res.json(
      await earnings.recordWithdrawal({
        courierId: req.params.id as string,
        branchId: branchScope(req),
        adminId: req.auth!.sub,
        amount: body.amount,
        idempotencyKey: body.idempotency_key,
      }),
    );
  }),
);

adminRoutes.get(
  "/couriers/:id/withdrawals/:entryId/slip",
  authenticate,
  requireRole("branch_admin", "super_admin"),
  validate(withdrawalSlipParamsSchema, "params"),
  validate(adminBranchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    sendPdf(res, await earnings.branchWithdrawalSlip(req.params.id as string, req.params.entryId as string, branchScope(req)));
  }),
);

// Road route of the selected order on the live board (super_admin passes branch_id).
adminRoutes.get(
  "/orders/:id/route",
  authenticate,
  requireRole("branch_admin", "super_admin"),
  validate(orderIdParamsSchema, "params"),
  validate(adminBranchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await adminOrderRoute(branchScope(req), req.params.id as string));
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
  "/orders/:id/assign",
  authenticate,
  requireRole("branch_admin"),
  validate(orderIdParamsSchema, "params"),
  validate(adminAssignRequestSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as AdminAssignRequest;
    res.json(
      await service.assignOrder({
        orderId: req.params.id as string,
        courierId: body.courier_id,
        adminId: req.auth!.sub,
        branchId: branchScope(req),
        idempotencyKey: body.idempotency_key,
      }),
    );
  }),
);

adminRoutes.post(
  "/orders/:id/release",
  authenticate,
  requireRole("branch_admin"),
  validate(orderIdParamsSchema, "params"),
  validate(adminReleaseRequestSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as AdminReleaseRequest;
    res.json(
      await service.releaseOrder({
        orderId: req.params.id as string,
        reason: body.reason,
        adminId: req.auth!.sub,
        branchId: branchScope(req),
        idempotencyKey: body.idempotency_key,
      }),
    );
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
