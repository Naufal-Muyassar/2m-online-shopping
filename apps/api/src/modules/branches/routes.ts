import { Router } from "express";
import { z } from "zod";
import {
  productDetailParamsSchema,
  productsQuerySchema,
  stockStreamQuerySchema,
  type Branch,
  type BranchesResponse,
  type ProductDetail,
  type ProductsResponse,
} from "@2m/shared";
import { pool } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { asyncHandler, validate } from "../../shared/http";
import * as catalog from "../catalog/repo";
import { stockStatusOf } from "../catalog/stock";
import { MAX_STREAMS, liveStreamCount, openStockStream } from "../inventory/live";

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

branchesRoutes.get(
  "/:id/products/:productId",
  validate(productDetailParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const branchId = req.params.id as string;
    if (!(await catalog.branchIsActive(pool, branchId))) throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
    const row = await catalog.getProduct(pool, branchId, req.params.productId as string);
    if (!row) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found in this branch");
    const body: ProductDetail = { ...row, stock_status: stockStatusOf(row.sellable_qty) };
    res.json(body);
  }),
);

// Live sellable quantity for the products a page shows (SSE). Public like the catalogue; holds no DB connection.
branchesRoutes.get(
  "/:id/stock/stream",
  validate(z.object({ id: z.string().uuid() }), "params"),
  validate(stockStreamQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const branchId = req.params.id as string;
    if (liveStreamCount() >= MAX_STREAMS) {
      res.setHeader("Retry-After", "30");
      throw new AppError(503, "LIVE_STOCK_BUSY", "Too many live stock connections, try again shortly");
    }
    if (!(await catalog.branchIsActive(pool, branchId))) throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
    const { product_ids } = req.query as unknown as z.infer<typeof stockStreamQuerySchema>;
    await openStockStream(res, branchId, product_ids);
  }),
);
