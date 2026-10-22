import { Router } from "express";
import { z } from "zod";
import { productsQuerySchema, type BranchesResponse, type ProductsResponse } from "@2m/shared";
import { pool } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { asyncHandler, validate } from "../../shared/http";
import * as catalog from "../catalog/repo";
import { stockProvider } from "../catalog/stock";

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
    const stock = await stockProvider.statusFor(
      branchId,
      rows.map((r) => r.id),
    );
    const body: ProductsResponse = {
      products: rows.map((r) => ({ ...r, stock_status: stock.get(r.id) ?? "available" })),
      categories,
      page: query.page,
      page_size: catalog.PAGE_SIZE,
      has_more: hasMore,
    };
    res.json(body);
  }),
);
