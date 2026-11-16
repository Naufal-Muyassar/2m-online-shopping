import { Router } from "express";
import {
  adminCompleteRefundRequestSchema,
  adminCreateRefundRequestSchema,
  adminRefundsQuerySchema,
  refundIdParamsSchema,
  type AdminCompleteRefundRequest,
  type AdminCreateRefundRequest,
  type AdminRefundsQuery,
  type AdminRefundsResponse,
} from "@2m/shared";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate, branchScope, requireRole } from "../auth/middleware";
import * as service from "./service";

// Mounted at /admin/refunds. Branch admins see their branch; super_admin passes branch_id.
export const refundsAdminRoutes = Router();

refundsAdminRoutes.use(authenticate, requireRole("branch_admin", "super_admin"));

const adminOf = (req: { auth?: { sub: string; role: string } }) => ({ id: req.auth!.sub, role: req.auth!.role });

refundsAdminRoutes.get(
  "/",
  validate(adminRefundsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { state } = req.query as unknown as AdminRefundsQuery;
    const body: AdminRefundsResponse = { refunds: await service.listBranch(branchScope(req), state) };
    res.json(body);
  }),
);

refundsAdminRoutes.post(
  "/",
  validate(adminCreateRefundRequestSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as AdminCreateRefundRequest;
    const refund = await service.createManual({
      branchId: branchScope(req),
      admin: adminOf(req),
      orderCode: body.order_code,
      amount: body.amount,
      note: body.note,
      idempotencyKey: body.idempotency_key,
    });
    res.status(201).json({ refund });
  }),
);

refundsAdminRoutes.post(
  "/:id/proof-upload-url",
  validate(refundIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    res.json(await service.proofUploadUrl(req.params.id as string, branchScope(req)));
  }),
);

refundsAdminRoutes.post(
  "/:id/complete",
  validate(refundIdParamsSchema, "params"),
  validate(adminCompleteRefundRequestSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as AdminCompleteRefundRequest;
    res.json({
      refund: await service.completeRefund({
        refundId: req.params.id as string,
        branchId: branchScope(req),
        admin: adminOf(req),
        transferRef: body.transfer_ref,
        proofKey: body.proof_key,
      }),
    });
  }),
);
