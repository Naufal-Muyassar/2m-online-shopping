# Copilot Build Prompts (P0 – P9)

## How to use

1. Put `copilot-instructions.md` at `.github/copilot-instructions.md` in the repo. It is attached to every request, so prompts below do not repeat context.
2. One prompt = one fresh Agent-mode session. Paste only the block under the heading. Commit after each prompt (you review the diff).
3. Order matters: P0 → P6 is the demo path (feature freeze 29 Oct). P7 → P9 start only after P6 is merged. P4 (courier PWA) and P5 (admin) can run in parallel once P3 is merged.
4. Audit prompts are written after the build, against the real code.

---

## P0 — Monorepo scaffold

```
Goal: create the monorepo skeleton exactly as described in the instructions. No business logic.

Build:
1. pnpm workspace: apps/{api,courier-pwa,admin-web,customer-web}, packages/{shared,config}, db/{migrations,seeds,metrics}, infra/{docker,nginx,scripts}, docs/{adr,runbook,reports}, services/ml-api.
2. api: Express app. `src/server.ts` (HTTP), `src/worker.ts` (exports startWorker, empty loop), `config/env.ts` (zod, fails fast), `shared/db.ts` (pg Pool + withTransaction(fn)), `shared/logger.ts` (pino), `shared/errors.ts` (AppError + express error handler returning {error:{code,message,details?}}), `shared/http.ts` (zod validate middleware, asyncHandler), `GET /health` (checks DB). Each ACTIVE module folder gets a `routes.ts` exporting an empty Router, mounted under /api/v1.
3. Three Vite React TS apps (courier-pwa, admin-web, customer-web) with Tailwind + shadcn/ui initialised, React Router, TanStack Query provider, Axios instance from packages/shared, dev proxy /api -> http://localhost:3000. courier-pwa additionally: vite-plugin-pwa (app-shell precache only), manifest (standalone, start_url "/", placeholder icons), and src/platform/{location,push,camera}.ts as interfaces with web/ implementations (location = getCurrentPosition wrapper, camera = file-input wrapper, push = no-op).
4. packages/shared: constants/{order-status.ts (11 states + transition table with allowed roles from instructions §5), roles.ts, courier-status.ts, failed-reasons.ts}; money.ts (integer rupiah helpers, formatIDR); contracts/ (empty index); api-client/ (Axios factory: adds X-App-Version, X-Platform, Authorization from a token getter; on 401 one refresh attempt via POST /auth/refresh then retry).
5. packages/config: tsconfig.base, eslint config, tailwind preset.
6. infra/docker/compose.dev.yml: postgres:16 + minio (+ bucket bootstrap). `.env.example` with every API variable.
7. Root scripts: dev, build, typecheck, lint, test, db:migrate, db:reset, db:reset:demo (the last three echo placeholders until P1).
8. SCAFFOLD folders (services/ml-api, api modules abuse/ai-gateway/cash-recon/notifications/refunds, courier-pwa offline/): README.md with exactly 3 lines.
9. .github/workflows/ci.yml: path-filtered jobs per app (install, typecheck, lint, test).

Done when: `pnpm install && pnpm typecheck` pass; compose.dev.yml starts; `pnpm --filter api dev` serves /health 200.
Don't: implement features, create DB tables, add libraries outside the stack list.
```

---

## P1 — Database, immutability, seeds

```
Goal: SQL migrations (node-pg-migrate) for the demo path and a one-command demo reset.

Tables (snake_case, uuid PKs via gen_random_uuid(), timestamptz, money as integer rupiah, branch_id on every operational table):
- branches(name, lat, lng, service_radius_m, open_hours jsonb, timezone default 'Asia/Jakarta', is_active, erp_branch_id, courier_capacity)
- branch_pricing_config(branch_id PK, base_fee, per_km, free_km, weight_threshold_kg, surcharge_per_kg, fee_min, fee_max, min_order, circuity_factor numeric default 1.3)
- branch_limits(branch_id PK, max_qty_per_sku_default, max_order_weight_kg, heavy_order_threshold_kg)
- courier_partners(name, fee_per_drop, contract_ref, is_active)
- users(role enum customer|courier|branch_admin|super_admin, name, phone unique, email unique nullable, password_hash, branch_id nullable, is_active)
- couriers(user_id PK→users, partner_id, branch_id, status enum IDLE|DELIVERING|OFFLINE, last_status_change, last_ping_at, current_lat, current_lng)
- sessions(user_id, refresh_token_hash, expires_at, revoked_at, user_agent)
- addresses(user_id, label, lat, lng, geohash, street, rt_rw, unit, receiver_name, receiver_phone, courier_note)
- products(sku unique, name, unit, category, weight_kg, dimension_cm jsonb, weight_source), branch_products(branch_id, product_id, price, is_active, display_order; PK both)
- orders(code unique, branch_id, customer_id, address_id, status enum 11 states, subtotal, delivery_fee, payment_fee, voucher_discount, grand_total, pricing_snapshot jsonb, payment_method, invoice_id, invoice_url, invoice_expires_at, assigned_courier_id nullable, return_pending bool default false, is_bulk_order bool default false, ready_at, delivered_at, created_at, updated_at)
- order_items(order_id, product_id, sku, name, qty, unit_price, weight_kg, picked_qty nullable)
- order_state_transitions(bigserial id, order_id, branch_id, from_status, to_status, actor_id nullable, actor_role, server_ts default now(), client_ts, lat, lng, accuracy, reason, idempotency_key; unique(order_id, idempotency_key) where idempotency_key is not null)
- outbox_events(id uuid, seq bigserial, aggregate_type, aggregate_id, event_type, event_version int default 1, payload jsonb, status enum PENDING|PROCESSED|FAILED, attempts int default 0, next_retry_at default now(), processed_at, branch_id, created_at)
- courier_pings(bigserial id, courier_id, branch_id, order_id nullable, lat, lng, accuracy, battery, client_ts, server_ts default now())
- proof_of_delivery(order_id PK, photo_key, lat, lng, taken_at, created_at)
- audit_logs(bigserial id, actor_id, actor_role, action, entity_type, entity_id, before jsonb, after jsonb, ip, ts default now())

Constraints/indexes: DB triggers that raise on UPDATE/DELETE for audit_logs and order_state_transitions; indexes: orders(branch_id,status,created_at), couriers(branch_id,status,last_status_change), outbox_events(next_retry_at) WHERE status='PENDING' and (seq), order_state_transitions(order_id, server_ts), courier_pings(courier_id, server_ts).

Seeds (db/seeds/demo; placeholder coordinates in one constants file marked "edit before demo"): 1 branch + pricing config + limits, 1 partner, 1 super_admin, 1 branch_admin, 3 couriers (IDLE, last_status_change staggered so FIFO order is obvious), 2 customers with addresses inside the radius, ~30 products with realistic weights (rice, gallon, oil, noodles, eggs...) + branch_products.
`pnpm db:reset` = drop schema + migrate + base seed. `pnpm db:reset:demo` = db:reset + 3 orders in PAID state ready for the walkthrough. Print demo credentials to the console.

Done when: `pnpm db:reset:demo` runs clean twice in a row; an UPDATE on audit_logs fails.
Don't: add tables not listed (payments/stock/refunds come later), write API code.
```

---

## P2 — API core: auth, RBAC, state machine, audit, outbox writer

```
Goal: the backbone every other module calls. Use the exact signature:
transition(tx: PoolClient, input: { orderId, to, actor: { id: string|null, role }, meta?: { lat?, lng?, accuracy?, client_ts?, reason?, courier_id?, idempotency_key? } }): Promise<{ order, replayed: boolean }>

Build:
1. auth module: POST /auth/login (phone or email + password), POST /auth/refresh (rotating, sessions table, cookie per instructions §4.11), POST /auth/logout (revoke), GET /auth/me. Middleware `authenticate`, `requireRole(...roles)`, and a `branchScope(req)` helper that returns the branch_id from the token (super_admin may pass an explicit branch_id).
2. orders module: `transition()` per instructions §4.1–4.2 and the §5 table. Validate (from,to) + actor role + required meta per row (reason, lat/lng, courier ownership, proof exists for DELIVERED). Read the current status with SELECT … FOR UPDATE inside the tx, then the conditional UPDATE. Write order_state_transitions (server_ts from now()) and an outbox event (event_type STATUS_CHANGED, event_version 1, payload {order_id, from, to, actor, branch_id}). Idempotency per §4.7: duplicate key → return stored result with replayed=true and write nothing. Set ready_at / delivered_at when entering READY / DELIVERED.
3. `audit(tx, {...})` helper writing audit_logs; called by transition() for: super_admin force-paid, ASSIGNED→READY (reassign), any admin cancel.
4. Admin endpoints: POST /admin/orders/:id/transition (branch_admin: ACCEPTED, PICKING, READY only; branch-scoped; calls dispatch drain after commit when `to` = READY — import a `drainBranch(branchId)` function from the dispatch module, create it as an exported no-op stub now), POST /admin/orders/:id/force-paid (super_admin, audited, labelled DEMO in code).
5. Contracts in packages/shared/contracts for all of the above.
6. Tests (vitest, real Postgres from compose): (a) table-driven test over the full 11×11 matrix: only table pairs succeed with a permitted actor; (b) two concurrent transitions on the same order → exactly one winner.

Done when: both tests pass.
Don't: dispatch logic, courier endpoints, pricing, payments.
```

---

## P3 — Dispatch, courier API, outbox worker, storage

```
Goal: everything the courier PWA and admin board call.

Build:
1. dispatch module: `tryAssign(orderId)` and `drainBranch(branchId)` using the exact SQL in instructions §5 inside one transaction with transition(READY→ASSIGNED, courier_id) and courier → DELIVERING. Replace the stub from P2. Endpoint PATCH /orders/:id/reassign (branch_admin, branch-scoped, optional courier_id): ASSIGNED→READY via transition (audited), courier → IDLE, then assign again.
2. courier module (role courier): GET /courier/me; PUT /courier/status {status: IDLE|OFFLINE} (rejected while DELIVERING; going IDLE calls drainBranch); GET /courier/orders (active assigned + last 10 completed, with items, address, courier_note, receiver, pin); GET /courier/orders/:id; POST /courier/orders/:id/status, proof upload-url, proof, pings — exactly the contracts in instructions §5. Status endpoint calls transition() with the courier as actor; DELIVERED → courier IDLE (unless return_pending) then drainBranch; FAILED → return_pending=true. Pings update couriers.current_lat/lng/last_ping_at and insert courier_pings.
3. admin read endpoints (branch-scoped): GET /admin/orders (active statuses + terminal from last 24h, with assigned courier and latest transition time), GET /admin/couriers (status, last_ping_at, current order). POST /admin/orders/:id/confirm-return (clears return_pending, courier → IDLE, audited, drainBranch).
4. storage module: S3 client + `presignPut(key)` / `presignGet(key)`; keys `proofs/{order_id}/{uuid}.jpg`; works with MinIO in dev (endpoint + forcePathStyle from env).
5. worker.ts: outbox polling loop per instructions §4.3 with a handler registry keyed by event_type (register a no-op handler for STATUS_CHANGED that only logs at debug level). Runnable via `pnpm --filter api worker`.
6. Contracts for every new endpoint in packages/shared/contracts.
7. Test (vitest, real Postgres): 10 parallel READY orders + 3 IDLE couriers → no courier assigned twice, remaining orders stay READY.

Done when: that test passes.
Don't: auto-OFFLINE, accept timeout, notifications, FCM.
```

---

## P4 — Courier PWA (online-only)

```
Goal: courier PWA per demo scope. Use the typed client and contracts from packages/shared; add any missing zod schemas to packages/shared/contracts.

Screens (mobile-first, large touch targets, Indonesian copy):
1. Login (password). Show an iPhone install hint ("Bagikan → Tambah ke Layar Utama"). Access token in memory; silent refresh on 401.
2. Home: IDLE/OFFLINE toggle (disabled while DELIVERING), current assignment card, last 10 completed.
3. Order detail: items, receiver name + tap-to-call, address text, courier note, "Buka di Google Maps" (https://www.google.com/maps/dir/?api=1&destination=lat,lng), and only the next allowed action (ASSIGNED → "Mulai antar"; ON_DELIVERY → "Selesai" / "Gagal kirim").
4. Proof flow: <input type="file" accept="image/*" capture="environment">, compress to ≤300 KB client-side, request signed URL, PUT straight to storage, register proof, then submit DELIVERED. One linear flow with visible progress.
5. Failed flow: reason select (enum) + note + photo → FAILED. Afterwards the card shows "Kembalikan barang ke cabang – menunggu konfirmasi admin".

Behaviour:
- Polling: TanStack Query refetchInterval 10 s for assigned orders; paused while the tab is hidden.
- Every status action attaches fresh GPS (getCurrentPosition, high accuracy, 8 s timeout) via platform/location. Denied/timeout → block the action with a clear message.
- src/tracking: foreground ping every 3 min while visible and not OFFLINE (POST /courier/pings); Screen Wake Lock while a delivery is ON_DELIVERY.
- Mutations: one idempotency_key per user action; TanStack mutation retry max 2 reusing the key.
- Every action shows loading, success and error feedback (toast + inline state).
- PWA: manifest + app-shell precache only. The update prompt never activates a new service worker while a delivery is ON_DELIVERY.

Done when: against the local API, the full happy path works in a mobile viewport: login → IDLE → (admin moves order to READY) → order appears → Mulai antar → photo → Selesai → back to IDLE.
Don't: offline queue, IndexedDB, push, background location, own navigation, i18n library.
```

---

## P5 — Admin web (first slice)

```
Goal: admin web first slice only.

Screens:
1. Login.
2. Live Order Board: columns PAID, ACCEPTED, PICKING, READY, ASSIGNED, ON_DELIVERY, plus a collapsed "Selesai" list (terminal orders, last 24 h). Polling 10 s. Cards older than an SLA constant per column are highlighted. Each card has the next-allowed action (Terima, Mulai picking, Siap kirim). super_admin also sees PENDING_PAYMENT orders with a "Tandai PAID (demo)" button.
3. Couriers tab: table (name, partner, status, last ping age, current order); "Reassign" dialog (auto or choose an IDLE courier); "Konfirmasi barang kembali" button for orders with return_pending.
4. Tabs "Short Pick", "Kas COD", "Config Cabang": visible, disabled, labelled "segera".
Branch scoping comes from the token; super_admin gets a branch switcher. Every action shows loading/success/error feedback.

Done when: from the demo-reset state an admin walks PAID → ACCEPTED → PICKING → READY and the order is auto-assigned to the longest-idle courier.
Don't: charts, short-pick logic, COD, branch config editing.
```

---

## P6 — Deploy & CI (single VPS)

```
Goal: a deployment path usable by 25 Oct. You cannot deploy from here; only produce consistent files.

Build:
1. apps/api/Dockerfile: multi-stage, non-root, one image; server by default, worker via command override.
2. infra/docker/compose.prod.yml: api, worker, postgres:16 (named volume, not published), nginx. No MinIO (external S3-compatible via env). Healthchecks, restart: unless-stopped.
3. infra/nginx: TLS reverse proxy, /api/ → api, rate limits on /api/v1/auth/ and /api/v1/webhooks/, HSTS, gzip.
4. Frontend hosting config per app (netlify.toml/_redirects): rewrite /api/* to the API origin with status 200, SPA fallback, build settings.
5. .github/workflows/deploy-api.yml: on push to main touching api/db/infra → test → build image → push GHCR → SSH to VPS: pull, compose up -d, run migrations, hit /health; fail if unhealthy.
6. infra/scripts/backup.sh (pg_dump | gzip | encrypt | upload to S3; 03:00 cron line in a comment) and restore-test.sh.
7. gitleaks step in CI.
8. docs/runbook/deploy.md (≤40 lines): first-time VPS setup, certbot, env list, deploy, rollback.

Done when: `docker compose -f infra/docker/compose.prod.yml config` validates and files reference each other consistently.
Don't: attempt to deploy, add monitoring stacks, add Redis.
```

---

## P7 — Customer web, catalog, cart, address, pricing, order creation (after P6)

```
Goal: customer path producing real orders. Payment is still simulated (admin "Tandai PAID").

API:
- GET /branches, GET /branches/:id/products?category=&q=&page= (master + branch price; stock status from a StockProvider interface with a StubStockProvider returning "available").
- Cart (server-side; migration for cart + cart_items): add/update/remove/get. Backend validates max_qty_per_sku and max_order_weight_kg (branch_limits) on every mutation and at checkout; derive is_bulk_order from thresholds.
- Addresses CRUD: pin required; reject pins outside the branch radius (Haversine vs service_radius_m) with code OUTSIDE_COVERAGE; store geohash.
- POST /calculate-price: input {branch_id, address_id, voucher_code?, payment_method}. Server derives distance (Haversine × branch circuity_factor), weight, subtotal. Logic order: voucher check (vouchers unsupported yet → clear error if a code is sent) → base fee (base + per_km × max(0, distance − free_km)) → weight surcharge above threshold (per kg) → clamp by fee_min/fee_max → payment fee from a `payment_fee_config` table (migration; seed all methods absorbed = 0). Output {base_delivery_fee, weight_surcharge, voucher_discount, final_shipping_cost, payment_fee, grand_total}, integer rupiah.
- POST /orders: one tx creating the order (CREATED) + order_items + immutable pricing_snapshot, then system transition to PENDING_PAYMENT via transition() (invoice fields stay null until the payments prompt enforces them). Generate human-readable `code` (ORD-YYMMDD-XXXX).

customer-web: branch picker (branch_id in the route), catalog + search box (plain ILIKE), cart page showing limit messages, address page with a map pin (MapLibre GL or Leaflet; tile URL from env), checkout with price breakdown, order status page polling every 10 s with a status timeline. Auth: register/login with password.

Done when: a customer can place an order that shows up as PENDING_PAYMENT for super_admin on the admin board.
Don't: Xendit, stock reservation, vouchers, OTP, search typo-tolerance.
```

---

## P8 — Xendit payments (after P7)

```
Goal: Xendit Invoice integration (hosted payment page).

Build module `payments`:
1. `PaymentProvider` interface {createInvoice, getInvoice, refund (signature only, not implemented), verifyCallbackToken}; `xendit.adapter.ts` using fetch against Xendit REST (secret key + callback token from env; test mode via env flag). Restrict the invoice to the chosen payment_method where Xendit supports it.
2. Order creation: Tx1 (order CREATED + snapshot) → OUTSIDE any DB tx call createInvoice (unique external_id `${order_code}-${attempt}`, amount = grand_total, duration 900 s, 5 s timeout; on retry look up by external_id first) → Tx2: transition PENDING_PAYMENT + invoice_id/invoice_url/invoice_expires_at. Failure → CANCELLED with reason PAYMENT_INIT_FAILED. From now on, PENDING_PAYMENT requires invoice_url.
3. POST /webhooks/xendit, in this order: verify `x-callback-token` with timingSafeEqual (401, empty body on failure) → insert payment_events (unique invoice_id+status; keep raw body + headers minus the token; duplicate → 200 immediately) → re-fetch the invoice from Xendit → check external_id maps to a PENDING_PAYMENT order and paid amount == grand_total → ONE tx: transition PENDING_PAYMENT→PAID (PAID) or →CANCELLED (EXPIRED) + outbox PAYMENT_SUCCESS / PAYMENT_EXPIRED → return 200. Never move a PAID order backwards; SETTLED after PAID is a no-op.
4. Reconciliation job in worker.ts every 5 min: PENDING_PAYMENT orders past invoice_expires_at or older than 20 min → getInvoice → same transition path.
5. customer-web: after order creation redirect to invoice_url; the return page polls order status and never trusts the redirect.
6. Migrations: payment_events, payment_fee_actual column on orders; seed payment_fee_config rows per method (absorbed).
7. Tests (vitest, mocked provider): same webhook ×3 → exactly one transition; wrong token → 401; altered amount → rejected; lost webhook → reconciliation completes the order.

Done when: those 4 tests pass.
Don't: refunds, COD, notifications, stock reservation.
```

---

## P9 — Stock reservation (after P8)

```
Goal: oversell protection. Redis becomes active.

Build:
1. Add redis to compose.dev and compose.prod, and env vars.
2. inventory module: table stock_snapshots(branch_id, product_id, qty, updated_at) as the stand-in for the central stock API behind `StockProvider`; table stock_reservations(order_id, invoice_id, product_id, qty, expires_at, status ACTIVE|COMMITTED|RELEASED). Postgres is the source of truth; Redis is the fast path (keys per branch+product).
3. Reserve: Redis Lua script that checks and decrements ALL cart SKUs atomically (all-or-nothing) with sellable = snapshot − reserved − buffer (buffer per product config, default 0). Called in Tx1 of order creation; rows written in the same Postgres tx. Insufficient → 409 OUT_OF_STOCK listing the SKUs.
4. Release (idempotent): `UPDATE stock_reservations SET status='RELEASED' WHERE order_id=$1 AND status='ACTIVE'`; increment Redis only when affected rows > 0. Triggered by the outbox PAYMENT_EXPIRED handler and by order → CANCELLED/FAILED.
5. Commit: the PAYMENT_SUCCESS outbox handler marks reservations COMMITTED and calls StockProvider.commit(idempotency_key) (stub that logs).
6. Sweeper in worker.ts every 60 s: release ACTIVE reservations past expires_at; on boot rebuild Redis counters from Postgres.
7. Tests: 50 parallel checkouts on a SKU with stock 1 → exactly 1 succeeds; PAYMENT_EXPIRED handled 3× adds stock back once; Redis flush then rebuild keeps active reservations; multi-SKU cart is all-or-nothing.

Done when: those 4 tests pass.
Don't: refunds, short pick, real central-API client.
```
