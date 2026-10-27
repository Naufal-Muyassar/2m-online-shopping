import { Router } from "express";
import { z } from "zod";
import { productsQuerySchema, type Branch, type BranchesResponse, type ProductsResponse } from "@2m/shared";
import { pool } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { asyncHandler, validate } from "../../shared/http";
import * as catalog from "../catalog/repo";
import { stockStatusOf } from "../catalog/stock";

export const branchesRoutes = Router();

// Public: customer branch picker and the super_admin branch switcher.
branchesRoutes.get(
  "/",
  asyncHandler(async (_req, res) => {
    const body: BranchesResponse = { branches: await catalog.listActiveBranches(pool) };
    res.json(body);
  }),
);

branchesRoutes.get(
  "/:id",
  validate(z.object({ id: z.string().uuid() }), "params"),
  asyncHandler(async (req, res) => {
    const branch = await catalog.getActiveBranch(pool, req.params.id as string);
    if (!branch) throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
    const body: Branch = branch;
    res.json(body);
  }),
);

branchesRoutes.get(
  "/:id/products",
  validate(z.object({ id: z.string().uuid() }), "params"),
  validate(productsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const branchId = req.params.id as string;
    if (!(await catalog.branchIsActive(pool, branchId))) throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
    const query = req.query as unknown as z.infer<typeof productsQuerySchema>;
    const [{ rows, hasMore }, categories] = await Promise.all([
      catalog.listProducts(pool, branchId, query),
      catalog.listCategories(pool, branchId),
    ]);
    const body: ProductsResponse = {
      products: rows.map((r) => ({ ...r, stock_status: stockStatusOf(r.sellable_qty) })),
      categories,
      page: query.page,
      page_size: catalog.PAGE_SIZE,
      has_more: hasMore,
    };
    res.json(body);
  }),
);
