import { Router } from "express";
import { z } from "zod";
import { cartAddSchema, cartBranchQuerySchema, cartSetQtySchema } from "@2m/shared";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate, requireRole } from "../auth/middleware";
import * as service from "./service";

export const cartRoutes = Router();
cartRoutes.use(authenticate, requireRole("customer"));

const productParams = z.object({ productId: z.string().uuid() });

cartRoutes.get(
  "/",
  validate(cartBranchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { branch_id } = req.query as z.infer<typeof cartBranchQuerySchema>;
    res.json(await service.getCart(req.auth!.sub, branch_id));
  }),
);

cartRoutes.post(
  "/items",
  validate(cartAddSchema),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof cartAddSchema>;
    res.json(await service.addItem(req.auth!.sub, b.branch_id, b.product_id, b.qty));
  }),
);

cartRoutes.patch(
  "/items/:productId",
  validate(productParams, "params"),
  validate(cartSetQtySchema),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof cartSetQtySchema>;
    res.json(await service.setQty(req.auth!.sub, b.branch_id, req.params.productId as string, b.qty));
  }),
);

cartRoutes.delete(
  "/items/:productId",
  validate(productParams, "params"),
  validate(cartBranchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { branch_id } = req.query as z.infer<typeof cartBranchQuerySchema>;
    res.json(await service.removeItem(req.auth!.sub, branch_id, req.params.productId as string));
  }),
);
