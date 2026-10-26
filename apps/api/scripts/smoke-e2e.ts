// End-to-end smoke test against a running API (PAYMENT_PROVIDER=mock) seeded with `pnpm db:reset:demo`.
// Prints PASS/FAIL per step and exits non-zero on the first failure.
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  Address,
  BranchesResponse,
  Cart,
  CourierJobsResponse,
  CourierMe,
  CourierOrder,
  CreatedOrder,
  CustomerOrderDetail,
  LoginResponse,
  MockInvoice,
  OrderTransitionResponse,
  PriceBreakdown,
  ProductsResponse,
  ProofUploadUrlResponse,
} from "@2m/shared";
import { DEMO_PASSWORD, USERS } from "../../../db/seeds/demo/constants";

const API = process.env.API_URL ?? "http://localhost:3000/api/v1";
const PAY_SKUS: ReadonlyArray<readonly [string, number]> = [["TLR-1KG", 1], ["GLP-1KG", 2]];
// Smallest well-formed JPEG; the API only checks the object key, not the bytes.
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

async function call<T>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

let n = 0;
async function step<T>(name: string, fn: () => Promise<{ value: T; detail: string }>): Promise<T> {
  n++;
  try {
    const { value, detail } = await fn();
    console.log(`PASS ${String(n).padStart(2, "0")} ${name} — ${detail}`);
    return value;
  } catch (err) {
    console.log(`FAIL ${String(n).padStart(2, "0")} ${name} — ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function expect<T>(actual: T, expected: T, what: string): void {
  if (actual !== expected) throw new Error(`${what}: expected ${String(expected)}, got ${String(actual)}`);
}

const gps = () => ({ lat: -6.2, lng: 106.8166, accuracy: 10, client_ts: new Date().toISOString(), idempotency_key: randomUUID() });

const login = (phone: string) =>
  call<LoginResponse>("POST", "/auth/login", { body: { identifier: phone, password: DEMO_PASSWORD } });

const customer = await step("customer login", async () => {
  const r = await login(USERS.customers[0]!.phone);
  expect(r.user.role, "customer", "role");
  return { value: r, detail: `role ${r.user.role}` };
});

const branch = await step("pick branch", async () => {
  const { branches } = await call<BranchesResponse>("GET", "/branches");
  const b = branches[0];
  if (!b) throw new Error("no active branch, run pnpm db:reset:demo");
  return { value: b, detail: b.name };
});

await step("add items to cart", async () => {
  let cart: Cart | undefined;
  for (const [sku, qty] of PAY_SKUS) {
    const { products } = await call<ProductsResponse>("GET", `/branches/${branch.id}/products?q=${encodeURIComponent(sku)}`);
    const p = products.find((x) => x.sku === sku);
    if (!p) throw new Error(`product ${sku} not found`);
    cart = await call<Cart>("POST", "/cart/items", { token: customer.access_token, body: { branch_id: branch.id, product_id: p.id, qty } });
  }
  return { value: cart!, detail: `${cart!.items.length} lines, subtotal ${cart!.subtotal}` };
});

const address = await step("create address", async () => {
  const { address: a } = await call<{ address: Address }>("POST", "/addresses", {
    token: customer.access_token,
    body: {
      branch_id: branch.id,
      label: "Smoke",
      lat: branch.lat + 0.005,
      lng: branch.lng + 0.005,
      street: "Jl. Smoke Test No. 1",
      receiver_name: "Smoke",
      receiver_phone: USERS.customers[0]!.phone,
    },
  });
  return { value: a, detail: a.id };
});

const quote = await step("quote", async () => {
  const q = await call<PriceBreakdown>("POST", "/calculate-price", {
    token: customer.access_token,
    body: { branch_id: branch.id, address_id: address.id, payment_method: "QRIS" },
  });
  if (!(q.grand_total > 0)) throw new Error("grand_total is not positive");
  return { value: q, detail: `${q.route_distance_km} km, shipping ${q.final_shipping_cost}, total ${q.grand_total}` };
});

const order = await step("create order", async () => {
  const { order: o } = await call<{ order: CreatedOrder }>("POST", "/orders", {
    token: customer.access_token,
    body: { branch_id: branch.id, address_id: address.id, payment_method: "QRIS" },
  });
  expect(o.status, "PENDING_PAYMENT", "status");
  expect(o.grand_total, quote.grand_total, "grand_total");
  return { value: o, detail: `${o.code} ${o.status}` };
});

await step("mock pay", async () => {
  const invoiceId = order.invoice_url.split("/").pop()!;
  const r = await call<{ outcome: string; invoice: MockInvoice }>("POST", `/dev/mock-payments/${invoiceId}/pay`, { token: customer.access_token });
  expect(r.outcome, "PAID", "settle outcome");
  return { value: r, detail: `invoice ${r.invoice.status}` };
});

await step("order is PAID", async () => {
  const { order: o } = await call<CustomerOrderDetail>("GET", `/orders/${order.id}`, { token: customer.access_token });
  expect(o.status, "PAID", "status");
  return { value: o, detail: o.status };
});

const admin = await step("admin login", async () => {
  const r = await login(USERS.branchAdmin.phone);
  expect(r.user.role, "branch_admin", "role");
  return { value: r, detail: `role ${r.user.role}` };
});
await step("admin accepts", async () => {
  const r = await call<OrderTransitionResponse>("POST", `/admin/orders/${order.id}/transition`, {
    token: admin.access_token,
    body: { to: "ACCEPTED", idempotency_key: randomUUID() },
  });
  expect(r.order.status, "ACCEPTED", "status");
  return { value: r, detail: r.order.status };
});

const courier = await step("courier login", async () => {
  const r = await login(USERS.couriers[0]!.phone);
  expect(r.user.role, "courier", "role");
  return { value: r, detail: `role ${r.user.role}` };
});
await step("courier is IDLE", async () => {
  let me = await call<CourierMe>("GET", "/courier/me", { token: courier.access_token });
  if (me.status === "OFFLINE") {
    await call("PUT", "/courier/status", { token: courier.access_token, body: { status: "IDLE" } });
    me = await call<CourierMe>("GET", "/courier/me", { token: courier.access_token });
  }
  expect(me.status, "IDLE", "courier status");
  return { value: me, detail: me.status };
});

await step("job list contains the order", async () => {
  const r = await call<CourierJobsResponse>("GET", "/courier/jobs", { token: courier.access_token });
  if (!r.jobs.some((j) => j.id === order.id)) throw new Error(`order missing from ${r.jobs.length} jobs`);
  return { value: r, detail: `${r.jobs.length} job(s), can_claim ${r.can_claim}` };
});

const claimed = await step("courier claims", async () => {
  const o = await call<CourierOrder>("POST", `/courier/jobs/${order.id}/claim`, { token: courier.access_token, body: gps() });
  expect(o.status, "PICKING", "status");
  return { value: o, detail: `${o.status}, ${o.items.length} items` };
});

await step("tick all items", async () => {
  for (const item of claimed.items) {
    await call("PATCH", `/courier/orders/${order.id}/items/${item.id}`, { token: courier.access_token, body: { picked_qty: item.qty } });
  }
  const o = await call<CourierOrder>("GET", `/courier/orders/${order.id}`, { token: courier.access_token });
  if (!o.items.every((i) => i.picked_qty >= i.qty)) throw new Error("some items are not fully picked");
  return { value: o, detail: `${o.items.length} items picked` };
});

await step("courier goes ON_DELIVERY", async () => {
  const r = await call<OrderTransitionResponse>("POST", `/courier/orders/${order.id}/status`, {
    token: courier.access_token,
    body: { to: "ON_DELIVERY", ...gps() },
  });
  expect(r.order.status, "ON_DELIVERY", "status");
  return { value: r, detail: r.order.status };
});

await step("upload and register proof", async () => {
  const { upload_url, photo_key } = await call<ProofUploadUrlResponse>("POST", `/courier/orders/${order.id}/proof/upload-url`, {
    token: courier.access_token,
  });
  const put = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: TINY_JPEG });
  if (!put.ok) throw new Error(`object storage PUT → HTTP ${put.status}`);
  await call("POST", `/courier/orders/${order.id}/proof`, { token: courier.access_token, body: { photo_key, lat: -6.2, lng: 106.8166 } });
  return { value: photo_key, detail: photo_key };
});

await step("courier delivers", async () => {
  const r = await call<OrderTransitionResponse>("POST", `/courier/orders/${order.id}/status`, {
    token: courier.access_token,
    body: { to: "DELIVERED", ...gps() },
  });
  expect(r.order.status, "DELIVERED", "status");
  return { value: r, detail: r.order.status };
});

await step("transition rows carry actor ids", async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  await db.connect();
  try {
    const { rows } = await db.query<{ to_status: string; actor_id: string | null; actor_role: string }>(
      `SELECT to_status, actor_id, actor_role FROM order_state_transitions WHERE order_id = $1 ORDER BY id`,
      [order.id],
    );
    const expected: Array<[string, string, string | null]> = [
      ["PENDING_PAYMENT", "system", null],
      ["PAID", "system", null],
      ["ACCEPTED", "branch_admin", admin.user.id],
      ["PICKING", "courier", courier.user.id],
      ["ON_DELIVERY", "courier", courier.user.id],
      ["DELIVERED", "courier", courier.user.id],
    ];
    expect(rows.length, expected.length, "transition row count");
    expected.forEach(([to, role, actor], i) => {
      const r = rows[i]!;
      expect(`${r.to_status}/${r.actor_role}/${r.actor_id}`, `${to}/${role}/${actor}`, `row ${i + 1}`);
    });
    return { value: rows, detail: `${rows.length} rows: ${rows.map((r) => r.to_status).join(" → ")}` };
  } finally {
    await db.end();
  }
});

console.log(`\nALL ${n} STEPS PASS (${order.code})`);
