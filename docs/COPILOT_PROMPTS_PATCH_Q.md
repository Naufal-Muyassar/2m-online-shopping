# Copilot Patch Prompts Q1 – Q6

Perubahan terhadap build P0–P9: alur "kurir klaim job dan menyiapkan barang", pricing dari Excel DS v2, dan alur customer end-to-end yang bisa didemokan.

## Sebelum mulai (manual, tanpa Copilot)

0. Commit kondisi sekarang. Jalankan sendiri: `pnpm install`, `pnpm -r typecheck`, `pnpm --filter api test`. P4, P5, dan P7 belum pernah dikompilasi. Perbaiki error kecil sendiri; untuk error besar kirim satu prompt "fix these typecheck errors: <paste>".
1. Urutan: **Q1 → (Q2 dan Q3, boleh paralel setelah Q1 di-merge) → Q4 → Q5 → Q6.** Q4 menyentuh `transition()` lagi, jadi harus setelah Q1.
2. Satu prompt = satu sesi Agent baru. Reasoning high cukup untuk Q1.
3. Setiap prompt diawali kalimat: "If Node/pnpm is unavailable here, do not try to install it: skip typecheck/tests and say so in the final reply." Tujuannya menghemat credit.

---

## Q1 — State machine: klaim job oleh kurir (backend)

```
If Node/pnpm is unavailable here, do not try to install it: skip typecheck/tests and say so in the final reply.

Goal: switch the order flow from "admin picks + FIFO auto-dispatch" to "courier claims a job and picks the groceries". Backend only (frontends are Q2/Q3).

New flow: PAID → (admin "Terima") ACCEPTED = job pool → (courier claims) PICKING → (courier "Jalan") ON_DELIVERY → DELIVERED | FAILED. READY and ASSIGNED stay in the enum but are DORMANT.

1. Transition table in packages/shared/src/constants/order-status.ts. Export `ACTIVE_TRANSITIONS` (below). Move the old FIFO-only pairs (PICKING→READY, READY→ASSIGNED, READY→CANCELLED, ASSIGNED→READY, ASSIGNED→ON_DELIVERY) into an exported but unused `FIFO_TRANSITIONS_DORMANT`. transition() honours ONLY ACTIVE_TRANSITIONS.

| From → To | Allowed actor | Requires |
|---|---|---|
| CREATED → PENDING_PAYMENT | system | invoice data |
| CREATED → CANCELLED | system, customer | reason |
| PENDING_PAYMENT → PAID | system, super_admin (demo force-paid, audited) | – |
| PENDING_PAYMENT → CANCELLED | system, customer | reason |
| PAID → ACCEPTED | branch_admin | – |
| PAID → CANCELLED | branch_admin, super_admin | reason |
| ACCEPTED → PICKING | courier (claim), branch_admin (manual assign) | courier IDLE in the order's branch |
| ACCEPTED → CANCELLED | branch_admin, super_admin | reason |
| PICKING → ACCEPTED | courier (assigned), branch_admin | reason; audited; courier → IDLE |
| PICKING → ON_DELIVERY | courier (assigned) | all items picked; lat, lng |
| PICKING → CANCELLED | super_admin | reason |
| ON_DELIVERY → DELIVERED | courier (assigned) | proof registered; lat, lng |
| ON_DELIVERY → FAILED | courier (assigned) | reason + proof or note; sets return_pending=true |

2. transition() behaviour:
- ACCEPTED→PICKING by a courier: courier must be IDLE and in the order's branch; set orders.assigned_courier_id = actor id; courier → DELIVERING (last_status_change = now()). By branch_admin: meta.courier_id required, that courier must be IDLE in the same branch; audited as "manual assign".
- PICKING→ACCEPTED (release): clear assigned_courier_id, courier → IDLE, audit entry.
- PICKING→ON_DELIVERY: every order_item must have picked_qty >= qty, else 409 PICKING_INCOMPLETE.
- PAID→ACCEPTED sets orders.accepted_at (new migration: column + index (branch_id, accepted_at) WHERE status='ACCEPTED').
- Error codes: 409 JOB_TAKEN when the conditional UPDATE affects 0 rows because status != ACCEPTED; 409 COURIER_BUSY when the courier is not IDLE.
- DELIVERED → courier IDLE (unless return_pending) stays as is. Remove all call sites of dispatch tryAssign/drainBranch; leave the dispatch module files in place but unmounted (dormant), and unmount PATCH /orders/:id/reassign.

3. Courier endpoints (courier module):
- GET /courier/jobs: if the courier is IDLE → ACCEPTED orders of the courier's branch with no assigned courier, ORDER BY accepted_at ASC LIMIT 20. Fields: id, code, accepted_at, item_count, total_weight_kg, route_distance_km and courier_wage (read from pricing_snapshot; null when missing), area_hint (address street truncated to 40 chars). NO receiver name/phone, full address or pin. If the courier is not IDLE → { jobs: [], can_claim: false, reason: 'OFFLINE' | 'BUSY' }.
- POST /courier/jobs/:id/claim body { lat, lng, accuracy, client_ts, idempotency_key } → transition(ACCEPTED→PICKING). Returns the order detail (now with receiver, address, pin).
- PATCH /courier/orders/:id/items/:itemId body { picked_qty }: assigned courier only, only while PICKING, 0 <= picked_qty <= qty.
- POST /courier/orders/:id/release body { reason } → PICKING→ACCEPTED.
- POST /courier/orders/:id/status: `to` stays ON_DELIVERY | DELIVERED | FAILED (ON_DELIVERY is now valid from PICKING).
- "Active order" in GET /courier/orders = PICKING, ON_DELIVERY, or FAILED with return_pending. Order detail includes items with picked_qty. Proof upload/register stays ON_DELIVERY only.

4. Admin endpoints: POST /admin/orders/:id/transition accepts only `to: ACCEPTED` (from PAID). New: POST /admin/orders/:id/assign { courier_id } (ACCEPTED→PICKING manual) and POST /admin/orders/:id/release (PICKING→ACCEPTED). confirm-return unchanged. Update contracts in packages/shared/contracts.

5. Update `.github/copilot-instructions.md` §5 (state list note, transition table, courier status rules, replace the Dispatch paragraph with the claim model, courier API contract) and append the assumptions to docs/ASSUMPTIONS.md.

6. Tests (vitest, real Postgres):
(a) full 11×11 matrix test rewritten against ACTIVE_TRANSITIONS;
(b) 10 IDLE couriers claim the same ACCEPTED order concurrently → exactly one success, nine JOB_TAKEN, exactly one courier DELIVERING;
(c) a DELIVERING courier cannot claim (COURIER_BUSY);
(d) PICKING→ON_DELIVERY with an unpicked item → PICKING_INCOMPLETE.
Move the old dispatch tests to test/dormant/ and exclude them from the default vitest run.

Done when: (a)–(d) pass.
Don't: touch frontends, pricing or payments; delete the dispatch code.
```

---

## Q2 — PWA kurir: daftar job, ambil, menyiapkan, Jalan

```
If Node/pnpm is unavailable here, do not try to install it: skip typecheck/tests and say so in the final reply.

Goal: update apps/courier-pwa to the claim flow from Q1. Use the typed client and contracts from packages/shared. Indonesian UI copy.

Home (by courier status):
- IDLE → "Job tersedia" list, polling every 10 s while the tab is visible (GET /courier/jobs). Card: kode order, jarak (km), jumlah item, berat (kg), upah (Rp, formatIDR), umur job ("5 menit lalu"), area_hint. Button "Ambil order": fresh GPS fix → POST /courier/jobs/:id/claim. 409 JOB_TAKEN → toast "Order sudah diambil kurir lain" and refetch. Empty state "Belum ada order".
- OFFLINE → "Anda offline" + toggle to IDLE.
- DELIVERING → the active order card (replaces the list).
The IDLE/OFFLINE toggle stays and is disabled while DELIVERING.

Order screen as a stepper driven by the order status:
1. PICKING ("Sedang disiapkan"): checklist of items; tapping an item sets picked_qty = qty (PATCH …/items/:itemId), with a small stepper to lower the quantity; progress "x dari y item siap". Receiver, address and note are visible after the claim. "Lepas order" (confirm dialog + reason) → POST /courier/orders/:id/release. Button "Jalan" is disabled until every item is fully picked; pressing it takes fresh GPS and calls the status endpoint with to=ON_DELIVERY.
2. ON_DELIVERY ("Dalam perjalanan"): receiver name + tap-to-call, address, courier note, "Buka di Google Maps" deep link, button "Sudah sampai" → existing proof flow (photo, compress, upload, register, DELIVERED). Failed flow unchanged.
- After DELIVERED return to Home (the job list when IDLE).

Remove the old ASSIGNED / "Mulai antar" UI. Pings carry order_id while PICKING or ON_DELIVERY. Wake Lock stays ON_DELIVERY only. One idempotency_key per user action as before. Every action shows loading/success/error feedback.

Done when, against the local API: claim → tick all items → Jalan → photo → Selesai → back to the job list.
Don't: offline queue, push, background location, new libraries.
```

---

## Q3 — Admin web: Terima dan pemantauan

```
If Node/pnpm is unavailable here, do not try to install it: skip typecheck/tests and say so in the final reply.

Goal: simplify apps/admin-web to the claim flow from Q1.

Live Order Board columns: PAID "Perlu diterima", ACCEPTED "Menunggu kurir", PICKING "Sedang disiapkan", ON_DELIVERY "Dalam perjalanan", plus the collapsed "Selesai" list. Polling 10 s. Cards on PICKING and ON_DELIVERY show the courier name. SLA highlight constants: PAID 5 min, ACCEPTED 5 min, PICKING 20 min, ON_DELIVERY 45 min.

Actions (branch_admin only):
- PAID card: "Terima" → POST /admin/orders/:id/transition { to: 'ACCEPTED' }.
- ACCEPTED card: "Tugaskan manual" → dialog listing IDLE couriers → POST /admin/orders/:id/assign.
- PICKING card: "Lepas kurir" (confirm dialog) → POST /admin/orders/:id/release.
- FAILED with return_pending: "Konfirmasi barang kembali" (unchanged).
super_admin keeps "Tandai PAID (demo)" on PENDING_PAYMENT orders.

Remove the old "Mulai picking", "Siap kirim" and the ASSIGNED Reassign dialog. Couriers tab stays (status, last ping age, current order, partner) and also shows motor_cluster if the API returns it (hide the column if absent). Disabled tabs stay.

Done when: a PAID order is accepted by the admin and appears in the courier job list within 10 s.
Don't: add libraries, charts or other tabs.
```

---

## Q4 — Pricing DS v2, upah kurir, field motor

```
If Node/pnpm is unavailable here, do not try to install it: skip typecheck/tests and say so in the final reply.

Goal: implement the shipping-fee model from Draft_DS_Kurir_v2.xlsx (sheets Parameter, T4_Grid_Jarak) in the pricing module, keeping the existing weight surcharge, voucher and fee_min/fee_max clamp steps.

1. Migration: add to branch_pricing_config: pricing_model text default 'ds_v2' (allowed 'ds_v2' | 'linear'), wage_base int 3500, wage_per_km int 1500, failed_rate numeric 0.03, failed_pay_fraction numeric 0.5, failed_fee_charged_fraction numeric 0, overhead_per_day int 10000, drops_per_day int 15, round_to int 500, cap_min_fee int 7500, cap_free_km numeric 4, cap_per_km numeric(10,2) 1333.33. Seed these values for the demo branch. Keep the old 'linear' code path selectable.
2. ds_v2 base fee (km = route one-way distance = Haversine × circuity_factor, 2 decimals):
   wage_full = wage_base + wage_per_km × km
   wage_eff = wage_full × (1 − failed_rate × (1 − failed_pay_fraction))
   cost_branch = overhead_per_day / drops_per_day
   fee_floor = ceil_to(round_to, (wage_eff + cost_branch) / (1 − failed_rate × (1 − failed_fee_charged_fraction)))
   fee_cap = cap_min_fee + cap_per_km × max(0, km − cap_free_km)
   base_delivery_fee = round(min(fee_floor, fee_cap))
   then weight surcharge, voucher and clamp exactly as today; integer rupiah.
3. Snapshot and columns: pricing_snapshot gets route_distance_km, fee_floor, fee_cap and courier_wage { scheme_version:'ds_v2', wage_base, wage_per_km, route_km, full (integer), failed_pay_fraction }. New orders columns: route_distance_km numeric(6,2), courier_wage int, courier_pay_final int. In transition(): to=DELIVERED sets courier_pay_final = courier_wage; to=FAILED sets round(courier_wage × snapshot failed_pay_fraction). POST /calculate-price also returns route_distance_km.
4. Couriers: add motor_code text (M1–M7) and motor_cluster char(1) check ('A','B'); seed the 3 demo couriers as M1/A, M3/B, M5/A. New reference table motor_clusters(cluster pk, cc_range, cost_per_km_normal numeric, cost_per_km_macet numeric) seeded A '110-125' 518.75 / 553.08 and B '150-160' 699.99 / 741.65 (source: Draft_DS_Kurir_v2.xlsx T2, confidence D). Reference only; pricing never reads it. Return motor_cluster in GET /admin/couriers.
5. docs/adr/0001-pricing-ds-v2.md (max 20 lines): formula, source file, and the open PM point "2M loses from about 2.25 km at the current wage hypothesis".
6. Tests: table-driven for km → base_delivery_fee: 0.25→5000, 0.5→5500, 1→6000, 2→7500, 3→7500, 4→7500, 4.25→7833, 5→8833, 6→10167, 8→12833, 10→15500; plus changing wage_per_km in the DB changes the quote without a deploy.

Done when: the table-driven test passes.
Don't: change the customer UI (Q5), the payment code, or add per-cluster customer pricing (clusters never change the customer fee).
```

---

## Q5 — Customer web end-to-end, stok, status, pembayaran mock

```
If Node/pnpm is unavailable here, do not try to install it: skip typecheck/tests and say so in the final reply.

Goal: make the customer path runnable end-to-end without depending on Xendit sandbox access.

1. Catalog stock: GET /branches/:id/products returns sellable_qty (integer >= 0, from the existing Postgres-derived sellable calculation, in ONE query, no N+1) and stock_status. UI shows "Stok: N" when N <= 20, "Tersedia" otherwise, "Habis" disabled. The "+" button respects sellable_qty and max_qty_per_sku.
2. Checkout page: pick or add an address (map pin) → immediately call POST /calculate-price and show "Ongkir (±X km)" with the breakdown (base, surcharge, voucher, payment fee, grand total) using route_distance_km; payment method selector (QRIS, VA banks, e-wallet) re-quotes on change.
3. Payment provider switch: env PAYMENT_PROVIDER = xendit | mock (default mock outside production; boot fails if mock is set with NODE_ENV=production). XENDIT_* env vars are required only when PAYMENT_PROVIDER=xendit.
   mock.adapter.ts implements the PaymentProvider interface: table mock_invoices(invoice_id, external_id, amount, method, status PENDING|PAID|EXPIRED, expires_at, paid_at) via migration; createInvoice returns invoice_url = `${CUSTOMER_WEB_URL}/mock-pay/${invoice_id}`; getInvoice reads the table in the same normalized shape as the Xendit adapter.
   Dev-only router (mounted only when provider=mock and NODE_ENV != production): GET /api/v1/dev/mock-payments/:invoiceId, POST …/pay, POST …/expire. pay/expire update the table then call the SAME internal settle function the Xendit webhook uses (extract it from the controller if it is inline; do not call the webhook over HTTP).
   customer-web page /mock-pay/:invoiceId: amount, method, buttons "Bayar (simulasi)" and "Kedaluwarsakan"; after paying, redirect to /orders/:id/return.
4. Order status page and return page: map statuses to customer labels in packages/shared/src/constants/order-status-labels.ts: PENDING_PAYMENT "Menunggu pembayaran", PAID "Pembayaran diterima", ACCEPTED "Pesanan diterima toko, mencari kurir", PICKING "Sedang disiapkan", ON_DELIVERY "Dalam perjalanan", DELIVERED "Selesai", CANCELLED "Dibatalkan", FAILED "Gagal diantar". Timeline order: PENDING_PAYMENT, PAID, ACCEPTED, PICKING, ON_DELIVERY, DELIVERED. The customer order endpoint adds courier_first_name from PICKING onward (no phone). Polling 10 s (3 s on the return page), stopping at terminal states.
5. .env.example: document PAYMENT_PROVIDER and the Xendit variables.
6. Tests: one vitest for the mock flow (create order → mock pay → order PAID exactly once; paying twice is a no-op; expire → CANCELLED). Keep the existing Xendit tests passing.

Done when, in the browser: catalog (stock visible) → cart → address pin → quote → choose method → mock pay → status "Pembayaran diterima" and the order shows in the admin PAID column.
Don't: refunds, vouchers, new libraries, changes to the Xendit adapter behaviour.
```

---

## Q6 — Seed, port tetap, skrip smoke

```
If Node/pnpm is unavailable here, do not try to install it: skip typecheck/tests and say so in the final reply.

Goal: one command starts everything, one command resets, one command proves the whole flow. Must work on Windows (no shell operators like & or &&-chains in package scripts).

1. `pnpm db:reset:demo`: reseed WITHOUT any orders. Data: branch (placeholder coordinates in the existing constants file), partner, super_admin, branch_admin, 3 couriers IDLE with staggered last_status_change and motor fields, 2 customers with saved addresses inside the radius, products with stock_snapshots 200 each, except 3 products with stock 3 and 1 product with stock 0 so the low/out states are visible. Flag `-- --with-orders` additionally creates 3 PAID orders (fallback if the customer flow breaks during the demo). Print credentials and URLs when finished.
2. Fixed ports with strictPort: api 3000, customer-web 5171, courier-pwa 5172, admin-web 5173 (vite server.port + strictPort in each config).
3. RUN_WORKER_IN_PROCESS env (default true outside production): the API process starts the outbox worker, sweeper and reconciliation loops itself; `worker.ts` stays a separate entrypoint for production.
4. Root script `dev:all` = `pnpm -r --parallel --filter "./apps/*" run dev` (api + three frontends). Confirm compose.dev starts postgres, minio (bucket created) and redis; document `docker compose -f infra/docker/compose.dev.yml up -d`.
5. apps/api/scripts/smoke-e2e.ts, run as `pnpm demo:smoke` (tsx, fetch only, against a running API with PAYMENT_PROVIDER=mock): customer login → add items → create address → quote → create order → mock pay → expect PAID → admin login → accept → courier login (IDLE) → GET jobs contains the order → claim → tick all items → ON_DELIVERY → presigned upload of a tiny JPEG + register proof → DELIVERED. Print PASS/FAIL per step with the actual status, exit non-zero on first failure. Also assert order_state_transitions rows exist with actor ids for each step.
6. docs/runbook/demo.md (max 40 lines): start order, URLs, demo accounts, the 10-step demo script, reset command, fallback (`--with-orders`).

Done when: `pnpm db:reset:demo` then `pnpm demo:smoke` prints all steps PASS (against locally running api, postgres, minio, redis).
Don't: new libraries, e2e browser frameworks, CI changes.
```
