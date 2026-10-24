import { Router } from "express";
import {
  courierClaimRequestSchema,
  courierItemParamsSchema,
  courierOrderStatusRequestSchema,
  courierReleaseRequestSchema,
  courierStatusRequestSchema,
  orderIdParamsSchema,
  pickItemRequestSchema,
  pingsRequestSchema,
  proofRegisterRequestSchema,
  type CourierClaimRequest,
  type CourierOrderStatusRequest,
  type CourierReleaseRequest,
  type CourierStatusRequest,
  type PickItemRequest,
  type PingsRequest,
  type ProofRegisterRequest,
} from "@2m/shared";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate, requireRole } from "../auth/middleware";
import * as service from "./service";

export const courierRoutes = Router();

courierRoutes.use(authenticate, requireRole("courier"));

courierRoutes.get(
  "/me",
  asyncHandler(async (req, res) => {
    res.json(await service.me(req.auth!.sub));
  }),
);

courierRoutes.put(
  "/status",
  validate(courierStatusRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.setStatus(req.auth!.sub, (req.body as CourierStatusRequest).status));
  }),
);

courierRoutes.get(
  "/jobs",
  asyncHandler(async (req, res) => {
    res.json(await service.listJobs(req.auth!.sub));
  }),
);

courierRoutes.post(
  "/jobs/:id/claim",
  validate(orderIdParamsSchema, "params"),
  validate(courierClaimRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.claimJob(req.auth!.sub, req.params.id as string, req.body as CourierClaimRequest));
  }),
);

courierRoutes.get(
  "/orders",
  asyncHandler(async (req, res) => {
    res.json(await service.listOrders(req.auth!.sub));
  }),
);

courierRoutes.patch(
  "/orders/:id/items/:itemId",
  validate(courierItemParamsSchema, "params"),
  validate(pickItemRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(
      await service.pickItem(req.auth!.sub, req.params.id as string, req.params.itemId as string, req.body as PickItemRequest),
    );
  }),
);

courierRoutes.post(
  "/orders/:id/release",
  validate(orderIdParamsSchema, "params"),
  validate(courierReleaseRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.releaseOrder(req.auth!.sub, req.params.id as string, req.body as CourierReleaseRequest));
  }),
);

courierRoutes.get(
  "/orders/:id",
  validate(orderIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    res.json(await service.getOrder(req.auth!.sub, req.params.id as string));
  }),
);

courierRoutes.post(
  "/orders/:id/status",
  validate(orderIdParamsSchema, "params"),
  validate(courierOrderStatusRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateOrderStatus(req.auth!.sub, req.params.id as string, req.body as CourierOrderStatusRequest));
  }),
);

courierRoutes.post(
  "/orders/:id/proof/upload-url",
  validate(orderIdParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    res.json(await service.proofUploadUrl(req.auth!.sub, req.params.id as string));
  }),
);

courierRoutes.post(
  "/orders/:id/proof",
  validate(orderIdParamsSchema, "params"),
  validate(proofRegisterRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.registerProof(req.auth!.sub, req.params.id as string, req.body as ProofRegisterRequest));
  }),
);

courierRoutes.post(
  "/pings",
  validate(pingsRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.recordPings(req.auth!.sub, req.body as PingsRequest));
  }),
);
