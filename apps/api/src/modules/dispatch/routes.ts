import { Router } from "express";
import { orderIdParamsSchema, reassignRequestSchema, type ReassignRequest } from "@2m/shared";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate, branchScope, requireRole } from "../auth/middleware";
import * as service from "./service";

export const dispatchRoutes = Router();

dispatchRoutes.patch(
  "/:id/reassign",
  authenticate,
  requireRole("branch_admin"),
  validate(orderIdParamsSchema, "params"),
  validate(reassignRequestSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as ReassignRequest;
    const result = await service.reassign({
      orderId: req.params.id as string,
      adminId: req.auth!.sub,
      branchId: branchScope(req),
      courierId: body.courier_id,
      idempotencyKey: body.idempotency_key,
    });
    res.json(result);
  }),
);
