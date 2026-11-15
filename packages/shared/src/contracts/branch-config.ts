import { z } from "zod";

const uuid = z.string().uuid();
const branchIdField = { branch_id: uuid.optional() };
const atLeastOne = (fields: readonly string[]) => (body: Record<string, unknown>) =>
  fields.some((f) => body[f] !== undefined);

// GET /admin/products (branch_admin, super_admin with branch_id): every product of the branch, hidden ones too
// Stock state as the admin sees it. hidden wins over the stock states; low is 1 to LOW_STOCK_AT units.
export const ADMIN_PRODUCT_STATES = ["available", "low", "out", "hidden"] as const;
export type AdminProductState = (typeof ADMIN_PRODUCT_STATES)[number];

export const adminProductsQuerySchema = z.object({
  ...branchIdField,
  q: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(40).optional(),
  state: z.enum(ADMIN_PRODUCT_STATES).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type AdminProductsQuery = z.infer<typeof adminProductsQuerySchema>;

export const adminProductSchema = z.object({
  id: uuid,
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  category: z.string(),
  weight_kg: z.number(),
  price: z.number().int(),
  // false hides the product from the customer catalogue of this branch
  is_active: z.boolean(),
  // Units new orders can still take: on-hand minus reserved minus buffer, never below 0
  sellable_qty: z.number().int(),
});
export type AdminProduct = z.infer<typeof adminProductSchema>;

export const adminProductsResponseSchema = z.object({
  products: z.array(adminProductSchema),
  // Categories this branch sells, for the filter
  categories: z.array(z.string()),
  // Counts over the whole branch, ignoring the filters, so the stock warning is always complete
  summary: z.object({
    total: z.number().int(),
    available: z.number().int(),
    low: z.number().int(),
    out: z.number().int(),
    hidden: z.number().int(),
  }),
  page: z.number().int(),
  page_size: z.number().int(),
  has_more: z.boolean(),
});
export type AdminProductsResponse = z.infer<typeof adminProductsResponseSchema>;

const priceField = z.number().int().min(1).max(100_000_000);
// Sets what new orders can take; the server adds back what is already reserved
const sellableField = z.number().int().min(0).max(1_000_000);

// PATCH /admin/products/:id: this branch's price, visibility and stock. Product details (name, unit,
// category, weight) are shared by every branch and change only through the super_admin catalogue.
const PRODUCT_FIELDS = ["price", "is_active", "sellable_qty"] as const;
export const adminProductUpdateSchema = z
  .object({
    ...branchIdField,
    price: priceField.optional(),
    is_active: z.boolean().optional(),
    sellable_qty: sellableField.optional(),
  })
  .strict()
  .refine(atLeastOne(PRODUCT_FIELDS), { message: "Nothing to update" });
export type AdminProductUpdate = z.infer<typeof adminProductUpdateSchema>;

// POST /admin/products: start selling a catalogue product in this branch
export const addBranchProductRequestSchema = z.object({
  ...branchIdField,
  product_id: uuid,
  price: priceField,
  sellable_qty: sellableField,
  is_active: z.boolean().default(true),
});
export type AddBranchProductRequest = z.input<typeof addBranchProductRequestSchema>;

// The shared catalogue: one row per SKU, with the branches that sell it.
export const catalogProductSchema = z.object({
  id: uuid,
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  category: z.string(),
  weight_kg: z.number(),
  branches: z.array(z.object({ id: uuid, name: z.string() })),
});
export type CatalogProduct = z.infer<typeof catalogProductSchema>;

// GET /admin/catalog (super_admin) and GET /admin/products/available (both admins: not yet sold here)
export const CATALOG_AVAILABILITY = ["sold", "not_sold"] as const;
export const catalogQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  // With availability: only SKUs this branch sells, or does not sell yet
  filter_branch_id: uuid.optional(),
  availability: z.enum(CATALOG_AVAILABILITY).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export const availableProductsQuerySchema = z.object({
  ...branchIdField,
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type AvailableProductsQuery = z.infer<typeof availableProductsQuerySchema>;
export const catalogResponseSchema = z.object({
  products: z.array(catalogProductSchema),
  categories: z.array(z.string()),
  page: z.number().int(),
  page_size: z.number().int(),
  has_more: z.boolean(),
});
export type CatalogResponse = z.infer<typeof catalogResponseSchema>;

const productDetailFields = {
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(30),
  category: z.string().trim().toLowerCase().min(1).max(40),
  weight_kg: z.number().positive().max(1000),
};

// POST /admin/catalog (super_admin). The SKU is fixed once created: orders and the central stock system key on it.
export const createCatalogProductSchema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, "SKU hanya huruf, angka dan tanda minus"),
  ...productDetailFields,
});
export type CreateCatalogProduct = z.input<typeof createCatalogProductSchema>;

// PATCH /admin/catalog/:id (super_admin): applies to every branch
const DETAIL_FIELDS = ["name", "unit", "category", "weight_kg"] as const;
export const updateCatalogProductSchema = z
  .object({
    name: productDetailFields.name.optional(),
    unit: productDetailFields.unit.optional(),
    category: productDetailFields.category.optional(),
    weight_kg: productDetailFields.weight_kg.optional(),
  })
  .strict()
  .refine(atLeastOne(DETAIL_FIELDS), { message: "Nothing to update" });
export type UpdateCatalogProduct = z.infer<typeof updateCatalogProductSchema>;

export const branchAdminAccountSchema = z.object({
  id: uuid,
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  is_active: z.boolean(),
});
export type BranchAdminAccount = z.infer<typeof branchAdminAccountSchema>;

// GET /admin/branch (branch_admin: own branch; super_admin: branch_id)
export const adminBranchSchema = z.object({
  id: uuid,
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  service_radius_m: z.number().int(),
  is_active: z.boolean(),
});
export type AdminBranch = z.infer<typeof adminBranchSchema>;

const latField = z.number().min(-90).max(90);
const lngField = z.number().min(-180).max(180);
const radiusField = z.number().int().min(500).max(50_000);
const branchNameField = z.string().trim().min(1).max(80);

// PATCH /admin/branch. is_active is super_admin only.
const BRANCH_FIELDS = ["name", "lat", "lng", "service_radius_m", "is_active"] as const;
export const adminBranchUpdateSchema = z
  .object({
    ...branchIdField,
    name: branchNameField.optional(),
    lat: latField.optional(),
    lng: lngField.optional(),
    service_radius_m: radiusField.optional(),
    is_active: z.boolean().optional(),
  })
  .refine(atLeastOne(BRANCH_FIELDS), { message: "Nothing to update" })
  .refine((b) => (b.lat === undefined) === (b.lng === undefined), { message: "lat and lng go together" });
export type AdminBranchUpdate = z.infer<typeof adminBranchUpdateSchema>;

// GET /admin/branches (super_admin): every branch, inactive ones too
export const superBranchSchema = adminBranchSchema.extend({
  product_count: z.number().int(),
  admins: z.array(branchAdminAccountSchema),
});
export type SuperBranch = z.infer<typeof superBranchSchema>;
export const superBranchesResponseSchema = z.object({ branches: z.array(superBranchSchema) });
export type SuperBranchesResponse = z.infer<typeof superBranchesResponseSchema>;

export const newBranchAdminSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().regex(/^\+?[0-9]{8,16}$/, "Nomor telepon tidak valid"),
  email: z.string().trim().toLowerCase().email().max(120).optional(),
  password: z.string().min(8).max(100),
});
export type NewBranchAdmin = z.infer<typeof newBranchAdminSchema>;

// POST /admin/branches (super_admin). Pricing, limits and the product list (prices, without stock) are
// copied from template_branch_id, so the new branch can take orders once its admin sets stock.
export const createBranchRequestSchema = z.object({
  name: branchNameField,
  lat: latField,
  lng: lngField,
  service_radius_m: radiusField,
  is_active: z.boolean().default(false),
  template_branch_id: uuid,
  admin: newBranchAdminSchema,
});
export type CreateBranchRequest = z.input<typeof createBranchRequestSchema>;
export const createBranchResponseSchema = z.object({ branch: superBranchSchema });
export type CreateBranchResponse = z.infer<typeof createBranchResponseSchema>;

// PATCH /admin/branch-admins/:id (super_admin). A new password, a deactivation or a move to another
// branch signs the admin out everywhere.
const ADMIN_FIELDS = ["name", "phone", "email", "password", "is_active", "move_to_branch_id"] as const;
export const updateBranchAdminSchema = z
  .object({
    name: newBranchAdminSchema.shape.name.optional(),
    phone: newBranchAdminSchema.shape.phone.optional(),
    // null removes the email
    email: z.string().trim().toLowerCase().email().max(120).nullable().optional(),
    password: newBranchAdminSchema.shape.password.optional(),
    is_active: z.boolean().optional(),
    move_to_branch_id: uuid.optional(),
  })
  .strict()
  .refine(atLeastOne(ADMIN_FIELDS), { message: "Nothing to update" });
export type UpdateBranchAdmin = z.infer<typeof updateBranchAdminSchema>;
export const updateBranchAdminResponseSchema = z.object({ admin: branchAdminAccountSchema, branch_id: uuid });
export type UpdateBranchAdminResponse = z.infer<typeof updateBranchAdminResponseSchema>;

// POST /admin/branches/:id/admins (super_admin)
export const createBranchAdminResponseSchema = z.object({ admin: branchAdminAccountSchema });
export type CreateBranchAdminResponse = z.infer<typeof createBranchAdminResponseSchema>;
