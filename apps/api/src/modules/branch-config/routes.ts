import { Router, type Request } from "express";
import { z } from "zod";
import {
  addBranchProductRequestSchema,
  availableProductsQuerySchema,
  catalogQuerySchema,
  createCatalogProductSchema,
  updateCatalogProductSchema,
  type AvailableProductsQuery,
  type CatalogQuery,
  type UpdateCatalogProduct,
  adminBranchQuerySchema,
  adminBranchUpdateSchema,
  adminProductsQuerySchema,
  adminProductUpdateSchema,
  createBranchRequestSchema,
  newBranchAdminSchema,
  type AdminBranchUpdate,
  type AdminProductsQuery,
  type AdminProductUpdate,
  type CreateBranchAdminResponse,
  type CreateBranchResponse,
  type NewBranchAdmin,
  type SuperBranchesResponse,
  updateBranchAdminSchema,
  type UpdateBranchAdmin,
  type UpdateBranchAdminResponse,
} from "@2m/shared";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate, branchScope, requireRole } from "../auth/middleware";
import * as service from "./service";

// Mounted under /admin next to the order and courier routes.
export const branchConfigRoutes = Router();

const idParams = z.object({ id: z.string().uuid() });
const actorOf = (req: Request): service.Actor => ({ id: req.auth!.sub, role: req.auth!.role });
const anyAdmin = [authenticate, requireRole("branch_admin", "super_admin")];
const superOnly = [authenticate, requireRole("super_admin")];

branchConfigRoutes.get(
  "/products",
  ...anyAdmin,
  validate(adminProductsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as AdminProductsQuery;
    res.json(
      await service.listProducts(branchScope(req), {
        q: query.q,
        category: query.category,
        state: query.state,
        page: query.page,
      }),
    );
  }),
);

branchConfigRoutes.patch(
  "/products/:id",
  ...anyAdmin,
  validate(idParams, "params"),
  validate(adminProductUpdateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as AdminProductUpdate;
    res.json(await service.updateProduct(actorOf(req), branchScope(req), req.params.id as string, body));
  }),
);

// Catalogue products this branch does not sell yet, for "Tambah produk".
branchConfigRoutes.get(
  "/products/available",
  ...anyAdmin,
  validate(availableProductsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as AvailableProductsQuery;
    res.json(
      await service.listCatalog({ q: query.q, branchId: branchScope(req), availability: "not_sold", page: query.page }),
    );
  }),
);

branchConfigRoutes.post(
  "/products",
  ...anyAdmin,
  validate(addBranchProductRequestSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof addBranchProductRequestSchema>;
    res.status(201).json(await service.addProductToBranch(actorOf(req), branchScope(req), body));
  }),
);

branchConfigRoutes.get(
  "/catalog",
  ...superOnly,
  validate(catalogQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as CatalogQuery;
    res.json(
      await service.listCatalog({
        q: query.q,
        branchId: query.filter_branch_id,
        availability: query.availability,
        page: query.page,
      }),
    );
  }),
);

branchConfigRoutes.post(
  "/catalog",
  ...superOnly,
  validate(createCatalogProductSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createCatalogProductSchema>;
    res.status(201).json(await service.createCatalogProduct(actorOf(req), body));
  }),
);

branchConfigRoutes.post(
  "/catalog/image-upload-url",
  ...superOnly,
  asyncHandler(async (_req, res) => {
    res.json(await service.catalogImageUpload());
  }),
);

branchConfigRoutes.patch(
  "/catalog/:id",
  ...superOnly,
  validate(idParams, "params"),
  validate(updateCatalogProductSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateCatalogProduct(actorOf(req), req.params.id as string, req.body as UpdateCatalogProduct));
  }),
);

branchConfigRoutes.get(
  "/branch",
  ...anyAdmin,
  validate(adminBranchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await service.getBranch(branchScope(req)));
  }),
);

branchConfigRoutes.patch(
  "/branch",
  ...anyAdmin,
  validate(adminBranchUpdateSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateBranch(actorOf(req), branchScope(req), req.body as AdminBranchUpdate));
  }),
);

branchConfigRoutes.get(
  "/branches",
  ...superOnly,
  asyncHandler(async (_req, res) => {
    const body: SuperBranchesResponse = { branches: await service.listBranches() };
    res.json(body);
  }),
);

branchConfigRoutes.post(
  "/branches",
  ...superOnly,
  validate(createBranchRequestSchema),
  asyncHandler(async (req, res) => {
    const body: CreateBranchResponse = {
      branch: await service.createBranch(actorOf(req), req.body as z.infer<typeof createBranchRequestSchema>),
    };
    res.status(201).json(body);
  }),
);

branchConfigRoutes.post(
  "/branches/:id/admins",
  ...superOnly,
  validate(idParams, "params"),
  validate(newBranchAdminSchema),
  asyncHandler(async (req, res) => {
    const body: CreateBranchAdminResponse = {
      admin: await service.createBranchAdmin(actorOf(req), req.params.id as string, req.body as NewBranchAdmin),
    };
    res.status(201).json(body);
  }),
);

branchConfigRoutes.patch(
  "/branch-admins/:id",
  ...superOnly,
  validate(idParams, "params"),
  validate(updateBranchAdminSchema),
  asyncHandler(async (req, res) => {
    const body: UpdateBranchAdminResponse = await service.updateBranchAdmin(
      actorOf(req),
      req.params.id as string,
      req.body as UpdateBranchAdmin,
    );
    res.json(body);
  }),
);
