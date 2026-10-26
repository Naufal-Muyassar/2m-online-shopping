// Simulates the demo courier driving from the branch to an ON_DELIVERY order's destination (~60 s, one ping / 3 s).
// Usage: pnpm demo:sim-pings <order_id>   (the order must be assigned to the first demo courier)
import type { CourierOrder, LoginResponse } from "@2m/shared";
import { BRANCH, DEMO_PASSWORD, USERS } from "../../../db/seeds/demo/constants";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run with NODE_ENV=production.");
  process.exit(1);
}

const orderId = process.argv[2];
if (!orderId) {
  console.error("Usage: pnpm demo:sim-pings <order_id>");
  process.exit(1);
}

const API = process.env.API_URL ?? "http://localhost:3000/api/v1";
const STEP_FRACTION = 0.05;
const INTERVAL_MS = 3000;

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
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const { access_token: token } = await call<LoginResponse>("POST", "/auth/login", {
  body: { identifier: USERS.couriers[0]!.phone, password: DEMO_PASSWORD },
});
const order = await call<CourierOrder>("GET", `/courier/orders/${orderId}`, { token });
const dest = order.address;

for (let i = 0; i < 1 / STEP_FRACTION; i++) {
  const f = i * STEP_FRACTION;
  const lat = BRANCH.lat + (dest.lat - BRANCH.lat) * f;
  const lng = BRANCH.lng + (dest.lng - BRANCH.lng) * f;
  await call("POST", "/courier/pings", {
    token,
    body: { pings: [{ lat, lng, accuracy: 10, order_id: orderId, client_ts: new Date().toISOString() }] },
  });
  console.log(`ping ${String(i + 1).padStart(2, "0")}: ${Math.round(f * 100)}% (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
  await sleep(INTERVAL_MS);
}
