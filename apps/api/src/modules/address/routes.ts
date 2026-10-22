import { Router } from "express";
import { z } from "zod";
import { addressInputSchema, type Address } from "@2m/shared";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate, requireRole } from "../auth/middleware";
import * as service from "./service";

export const addressRoutes = Router();
addressRoutes.use(authenticate, requireRole("customer"));

const idParams = z.object({ id: z.string().uuid() });

addressRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const addresses: Address[] = await service.list(req.auth!.sub);
    res.json({ addresses });
  }),
);

addressRoutes.post(
  "/",
  validate(addressInputSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ address: await service.create(req.auth!.sub, req.body) });
  }),
);

addressRoutes.put(
  "/:id",
  validate(idParams, "params"),
  validate(addressInputSchema),
  asyncHandler(async (req, res) => {
    res.json({ address: await service.update(req.auth!.sub, req.params.id as string, req.body) });
  }),
);

addressRoutes.delete(
  "/:id",
  validate(idParams, "params"),
  asyncHandler(async (req, res) => {
    await service.remove(req.auth!.sub, req.params.id as string);
    res.status(204).end();
  }),
);
