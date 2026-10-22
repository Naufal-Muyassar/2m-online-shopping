import { Router } from "express";
import {
  courierOrderStatusRequestSchema,
  courierStatusRequestSchema,
  orderIdParamsSchema,
  pingsRequestSchema,
  proofRegisterRequestSchema,
  type CourierOrderStatusRequest,
  type CourierStatusRequest,
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
  "/orders",
  asyncHandler(async (req, res) => {
    res.json(await service.listOrders(req.auth!.sub));
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
