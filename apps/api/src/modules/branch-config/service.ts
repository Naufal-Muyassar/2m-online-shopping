import bcrypt from "bcryptjs";
import type {
  AdminBranch,
  AdminBranchUpdate,
  AdminProduct,
  AdminProductsResponse,
  AdminProductUpdate,
  BranchAdminAccount,
  CatalogProduct,
  CatalogResponse,
  NewBranchAdmin,
  Role,
  SuperBranch,
  UpdateCatalogProduct,
} from "@2m/shared";
import { audit } from "../../shared/audit";
import { pool, withTransaction, type Tx } from "../../shared/db";
import { AppError } from "../../shared/errors";
import * as counters from "../inventory/counters";
import * as repo from "./repo";

export interface Actor {
  id: string;
  role: Role;
}

const productNotFound = () => new AppError(404, "PRODUCT_NOT_FOUND", "Product not found in this branch");
const branchNotFound = () => new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");

export async function listProducts(branchId: string, opts: { q?: string; page: number }): Promise<AdminProductsResponse> {
  const [{ rows, hasMore }, categories] = await Promise.all([
    repo.listBranchProducts(pool, branchId, opts),
    repo.listAllCategories(pool),
  ]);
  return { products: rows, categories, page: opts.page, page_size: repo.ADMIN_PAGE_SIZE, has_more: hasMore };
}

export async function updateProduct(
  actor: Actor,
  branchId: string,
  productId: string,
  body: AdminProductUpdate,
): Promise<AdminProduct> {
  return withTransaction(async (tx) => {
    if (!(await repo.lockBranchProduct(tx, branchId, productId))) throw productNotFound();
    const before = (await repo.getBranchProduct(tx, branchId, productId))!;

    await repo.updateBranchProduct(tx, branchId, productId, body);
    // Last, because it takes the exclusive stock lock: hold it for as short a time as possible.
    if (body.sellable_qty !== undefined) await counters.setSellable(tx, branchId, productId, body.sellable_qty);

    const after = (await repo.getBranchProduct(tx, branchId, productId))!;
    await audit(tx, {
      actorId: actor.id,
      actorRole: actor.role,
      branchId,
      action: "PRODUCT_UPDATED",
      entityType: "product",
      entityId: productId,
      before,
      after,
    });
    return after;
  });
}

// Starts selling a catalogue product in this branch, with its price and stock.
export async function addProductToBranch(
  actor: Actor,
  branchId: string,
  body: { product_id: string; price: number; sellable_qty: number; is_active: boolean },
): Promise<AdminProduct> {
  return withTransaction(async (tx) => {
    if (!(await repo.getBranch(tx, branchId, { lock: true }))) throw branchNotFound();
    if (!(await repo.getCatalogProduct(tx, body.product_id))) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found in the catalogue");
    }
    const added = await repo.insertBranchProduct(tx, {
      branchId,
      productId: body.product_id,
      price: body.price,
      isActive: body.is_active,
    });
    if (!added) throw new AppError(409, "PRODUCT_ALREADY_IN_BRANCH", "This branch already sells this product");
    await counters.setSellable(tx, branchId, body.product_id, body.sellable_qty);

    const after = (await repo.getBranchProduct(tx, branchId, body.product_id))!;
    await audit(tx, {
      actorId: actor.id,
      actorRole: actor.role,
      branchId,
      action: "PRODUCT_ADDED_TO_BRANCH",
      entityType: "product",
      entityId: body.product_id,
      after,
    });
    return after;
  });
}

export async function listCatalog(opts: {
  q?: string;
  branchId?: string;
  availability?: "sold" | "not_sold";
  page: number;
}): Promise<CatalogResponse> {
  const [{ rows, hasMore }, categories] = await Promise.all([repo.listCatalog(pool, opts), repo.listAllCategories(pool)]);
  return { products: rows, categories, page: opts.page, page_size: repo.ADMIN_PAGE_SIZE, has_more: hasMore };
}

export async function createCatalogProduct(
  actor: Actor,
  body: { sku: string; name: string; unit: string; category: string; weight_kg: number },
): Promise<CatalogProduct> {
  return withTransaction(async (tx) => {
    let id: string;
    try {
      id = await repo.insertCatalogProduct(tx, body);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw new AppError(409, "SKU_EXISTS", "This SKU already exists");
      throw err;
    }
    const after = (await repo.getCatalogProduct(tx, id))!;
    await audit(tx, {
      actorId: actor.id,
      actorRole: actor.role,
      branchId: null,
      action: "CATALOG_PRODUCT_CREATED",
      entityType: "product",
      entityId: id,
      after,
    });
    return after;
  });
}

// Applies to every branch that sells the product.
export async function updateCatalogProduct(actor: Actor, productId: string, body: UpdateCatalogProduct): Promise<CatalogProduct> {
  return withTransaction(async (tx) => {
    const before = await repo.getCatalogProduct(tx, productId);
    if (!before) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found in the catalogue");
    await repo.updateCatalogProduct(tx, productId, body);
    const after = (await repo.getCatalogProduct(tx, productId))!;
    await audit(tx, {
      actorId: actor.id,
      actorRole: actor.role,
      branchId: null,
      action: "CATALOG_PRODUCT_UPDATED",
      entityType: "product",
      entityId: productId,
      before,
      after,
    });
    return after;
  });
}

export async function getBranch(branchId: string): Promise<AdminBranch> {
  const branch = await repo.getBranch(pool, branchId);
  if (!branch) throw branchNotFound();
  return branch;
}

export async function updateBranch(actor: Actor, branchId: string, body: AdminBranchUpdate): Promise<AdminBranch> {
  // Opening a branch to customers, or closing it, is the owner's call.
  if (body.is_active !== undefined && actor.role !== "super_admin") {
    throw new AppError(403, "FORBIDDEN", "Only super_admin can open or close a branch");
  }
  return withTransaction(async (tx) => {
    const before = await repo.getBranch(tx, branchId, { lock: true });
    if (!before) throw branchNotFound();
    await repo.updateBranch(tx, branchId, body);
    const after = (await repo.getBranch(tx, branchId))!;
    await audit(tx, {
      actorId: actor.id,
      actorRole: actor.role,
      branchId,
      action: "BRANCH_UPDATED",
      entityType: "branch",
      entityId: branchId,
      before,
      after,
    });
    return after;
  });
}

export const listBranches = (): Promise<SuperBranch[]> => repo.listAllBranches(pool);

async function insertAdmin(tx: Tx, actor: Actor, branchId: string, admin: NewBranchAdmin): Promise<BranchAdminAccount> {
  const passwordHash = await bcrypt.hash(admin.password, 10);
  let account: BranchAdminAccount;
  try {
    account = await repo.insertBranchAdmin(tx, {
      branchId,
      name: admin.name,
      phone: admin.phone,
      email: admin.email ?? null,
      passwordHash,
    });
  } catch (err) {
    // The whole transaction rolls back, so a new branch is never left without its admin.
    if ((err as { code?: string }).code === "23505") {
      throw new AppError(409, "ACCOUNT_EXISTS", "Phone number or email is already registered");
    }
    throw err;
  }
  await audit(tx, {
    actorId: actor.id,
    actorRole: actor.role,
    branchId,
    action: "BRANCH_ADMIN_CREATED",
    entityType: "user",
    entityId: account.id,
    after: { id: account.id, role: "branch_admin", branch_id: branchId },
  });
  return account;
}

export async function createBranch(
  actor: Actor,
  input: {
    name: string;
    lat: number;
    lng: number;
    service_radius_m: number;
    is_active: boolean;
    template_branch_id: string;
    admin: NewBranchAdmin;
  },
): Promise<SuperBranch> {
  return withTransaction(async (tx) => {
    const templateId = input.template_branch_id;
    const id = await repo.insertBranch(tx, {
      name: input.name,
      lat: input.lat,
      lng: input.lng,
      serviceRadiusM: input.service_radius_m,
      isActive: input.is_active,
      templateId,
    });
    if (!id) throw new AppError(404, "BRANCH_NOT_FOUND", "Template branch not found");

    const pricing = await repo.copyPricingConfig(tx, id, templateId);
    const limits = await repo.copyLimits(tx, id, templateId);
    if (pricing === 0 || limits === 0) {
      throw new AppError(409, "TEMPLATE_INCOMPLETE", "Template branch has no delivery pricing or order limits");
    }
    await repo.copyProducts(tx, id, templateId);

    await audit(tx, {
      actorId: actor.id,
      actorRole: actor.role,
      branchId: id,
      action: "BRANCH_CREATED",
      entityType: "branch",
      entityId: id,
      after: { ...input, admin: undefined, id },
    });
    await insertAdmin(tx, actor, id, input.admin);
    return (await repo.listAllBranches(tx, id))[0]!;
  });
}

export async function createBranchAdmin(actor: Actor, branchId: string, admin: NewBranchAdmin): Promise<BranchAdminAccount> {
  return withTransaction(async (tx) => {
    if (!(await repo.getBranch(tx, branchId, { lock: true }))) throw branchNotFound();
    return insertAdmin(tx, actor, branchId, admin);
  });
}
