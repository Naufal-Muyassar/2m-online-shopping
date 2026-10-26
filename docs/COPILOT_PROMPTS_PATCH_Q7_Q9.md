# Copilot Patch Prompts Q7 – Q9

Lanjutan Q1–Q6. Xendit ditunda: simulasi pembayaran (mock) menjadi jalur resmi demo.

## Sebelum dan sesudah

0. **Gate manual dulu (tanpa Copilot):** `docker compose -f infra/docker/compose.dev.yml up -d`, `pnpm install`, `pnpm -r typecheck`, `pnpm --filter api test`, `pnpm db:reset:demo`, `pnpm dev:all`, lalu `pnpm demo:smoke`. Kumpulkan SEMUA error jadi satu prompt perbaikan, jangan satu per satu.
1. Urutan: **Q7 → Q8 → Q9.** Q8 memakai halaman detail dari Q7. Jalankan Q9 sebelum hosting ke internet publik.
2. Satu prompt = satu sesi Agent baru. Awali setiap prompt dengan baris "If Node/pnpm is unavailable…" (sudah ada di bawah).

---

## Q7 — Riwayat pesanan, detail, bukti pengantaran (customer)

```
If Node/pnpm is unavailable here, do not try to install it: skip typecheck/tests and say so in the final reply.

Goal: customers can see their order history, full order detail with the status timeline, and the proof-of-delivery photo. Reuse and extend the existing customer order endpoint/page from Q5; the return page must keep working.

API (customer role, own orders only; any other order id → 404):
1. GET /api/v1/orders?cursor=&limit=20 (limit max 50): newest first, keyset cursor on (created_at, id). Item: id, code, status, created_at, grand_total, item_count, branch_name.
2. GET /api/v1/orders/:id: extend the existing detail response (keep the fields the return/status page already uses). Build the response through a zod RESPONSE schema in packages/shared/contracts (whitelist; never spread DB rows or pricing_snapshot). Fields:
   - order: id, code, status, created_at, paid_at, branch_name
   - items[]: name, unit, qty, picked_qty (0 if null), unit_price, line_total
   - pricing: subtotal, delivery_fee, voucher_discount, payment_fee, grand_total, route_distance_km (plus the weight surcharge if it already exists as a stored field)
   - address: label, street, rt_rw, unit, receiver_name, receiver_phone, courier_note, lat, lng
   - payment: method, paid_at
   - timeline[]: { status: to_status, at: server_ts } from order_state_transitions, ascending (no actor ids, coordinates, reasons or idempotency keys)
   - courier: { first_name } from PICKING onward (existing rule), else null
   - failure: for FAILED/CANCELLED a fixed Indonesian label mapped from the reason enum: CUSTOMER_UNREACHABLE → "Kurir tidak dapat menghubungi penerima", ADDRESS_NOT_FOUND → "Alamat tidak ditemukan", REFUSED → "Pesanan ditolak penerima", anything else/free text → "Pengantaran tidak berhasil". Never return free-text reasons.
   - proof: only for DELIVERED or FAILED when a proof row exists: { photo_url: presigned GET via presignGet (TTL 300 s, generated on every request), taken_at }. Never proof coordinates.
   - tracking_available: status === 'ON_DELIVERY' (used by the next prompt)
3. Contracts in packages/shared/contracts. Append one line to docs/ASSUMPTIONS.md: proof photo retention period is TBD (privacy).
4. Tests (vitest, real Postgres): another customer's order → 404; the JSON of a DELIVERED order contains none of these keys anywhere: courier_wage, courier_pay_final, fee_floor, fee_cap, pricing_snapshot, actor_id, idempotency_key, motor_cluster; no lat/lng inside timeline entries; proof present only for DELIVERED/FAILED; timeline ascending; cursor pagination returns each order exactly once.

customer-web (Indonesian copy):
- Header link "Pesanan saya" → /orders: cards (code, status label from the shared labels, date, total, item count), "Muat lagi" button using the cursor, empty/loading/error states.
- /orders/:id: status header + the existing timeline component; items table; price breakdown; address block; courier first name; payment info; failure label when present; "Bukti pengantaran" section with the photo (tap to enlarge; on image load error refetch the order once to get a fresh URL) and taken time. Poll every 10 s while the status is non-terminal. Add a "Lihat detail pesanan" link on the existing return page.

Done when: a customer who completed the demo flow sees the order in /orders and opens a detail page with the full timeline and the courier's proof photo.
Don't: tracking map (next prompt), reorder, PDF invoices, new libraries.
```

---

## Q8 — Live location kurir untuk customer

```
If Node/pnpm is unavailable here, do not try to install it: skip typecheck/tests and say so in the final reply.

Goal: live courier location for the customer while the order is ON_DELIVERY. Builds on the detail page from Q7.

API:
1. GET /api/v1/orders/:id/tracking (customer, own order only, else 404).
   - status != ON_DELIVERY → 200 { active: false, status }.
   - ON_DELIVERY → { active: true, courier: { lat, lng, accuracy, updated_at } | null, destination: { lat, lng }, distance_remaining_km, eta_minutes, stale }.
   - Position = latest courier_pings row with order_id = this order (server_ts desc); fall back to couriers.current_lat/lng/last_ping_at; none → courier: null.
   - distance = Haversine(courier, destination) × the branch's circuity_factor (2 decimals); eta_minutes = max(1, ceil(distance ÷ TRACKING_AVG_SPEED_KMH × 60)); env TRACKING_AVG_SPEED_KMH default 20 (document in .env.example). stale = updated_at older than 60 s.
   - Privacy: no courier id, phone or ping history; nothing returned after DELIVERED. Response zod schema in packages/shared/contracts.
2. Script apps/api/scripts/sim-courier-pings.ts, run as `pnpm demo:sim-pings <order_id>`: logs in as the demo courier (credentials from the seed constants), reads the order's destination via the courier order detail, and POSTs one ping every 3 s moving 5% of the straight line from the branch to the destination for about 60 s, with order_id set. Refuse to run when NODE_ENV=production. fetch only.

courier-pwa:
3. While the active order is ON_DELIVERY, ping every 15 s (constant PING_INTERVAL_ON_DELIVERY_MS = 15000; setInterval + getCurrentPosition with maximumAge 5000) including order_id. Other states keep the 3-minute foreground ping. On the order screen during ON_DELIVERY show "Jaga layar tetap menyala agar lokasi terkirim" and "Lokasi terakhir terkirim X detik lalu" (updated after each successful ping).

customer-web:
4. components/map/MapView.tsx: thin Leaflet wrapper (props: markers[{id, lat, lng, kind: 'courier' | 'destination'}], fitBounds on first render and when markers change; tile URL from the existing env). Use it for the tracking card only; do not refactor the address picker.
5. On /orders/:id when tracking_available: "Lacak kurir" card using MapView. TanStack Query refetchInterval 5 s, paused while the tab is hidden, stops when active=false. Text: "Kurir ±N menit lagi (perkiraan)" with the distance; "Diperbarui X detik lalu"; when stale "Lokasi kurir belum diperbarui sejak X menit"; when courier is null "Menunggu lokasi kurir". Move the courier marker with setLatLng (do not re-create it). When the status becomes DELIVERED the card disappears and the proof section shows (invalidate the order query).
6. Tests (vitest, real Postgres): tracking is owner-only; inactive before ON_DELIVERY and after DELIVERED; stale flag; ETA math with a fixed ping; forbidden keys absent.

Done when: with sim-pings running, the customer's map shows the courier marker moving toward the destination with a decreasing ETA, and after DELIVERED the map is replaced by the proof photo.
Don't: routing API calls, WebSocket/SSE, push notifications, background location, new libraries.
```

---

## Q9 — Simulasi pembayaran sebagai jalur demo resmi (aman untuk di-host)

```
If Node/pnpm is unavailable here, do not try to install it: skip typecheck/tests and say so in the final reply.

Goal: make "simulate paid" the official, safe demo payment path. Xendit stays exactly as it is and is postponed: do not touch xendit.adapter or the webhook.

1. Env DEMO_MODE (default true outside production, false in production). Boot rules: PAYMENT_PROVIDER=mock requires DEMO_MODE=true (allowed even with NODE_ENV=production when DEMO_MODE=true, so a hosted demo works); mock with DEMO_MODE=false fails at boot; xendit rules unchanged. RUN_WORKER_IN_PROCESS default = (NODE_ENV != production) || DEMO_MODE.
2. Mock payment routes (GET/POST /dev/mock-payments/...) require authentication: the caller must be the order owner (invoice → order → customer_id) or super_admin; anyone else gets 404. Mounted only when provider=mock and DEMO_MODE=true. Move the /mock-pay/:invoiceId page behind the customer auth guard (login redirect returns to the page).
3. Migration: orders.is_demo_payment boolean default false. Set it to true when an order is settled through the mock provider or via admin force-paid (inside the same settle/transition transaction). If views exist in db/metrics, exclude is_demo_payment = true from cost/contribution KPIs.
4. GET /api/v1/meta/config (public) → { demo_mode: boolean }. customer-web shows a slim banner "Mode demo: pembayaran disimulasikan" on the checkout and mock-pay pages when true. admin-web shows "Tandai PAID (demo)" only when demo_mode is true.
5. Append to docs/ASSUMPTIONS.md: Xendit integration postponed; simulated payments are the demo path; is_demo_payment marks them.
6. Tests: mock + DEMO_MODE=false → boot throws; non-owner mock pay → 404; owner → PAID exactly once with is_demo_payment=true; admin force-paid sets the flag; /meta/config reflects the env.

Done when: those tests pass.
Don't: change the Xendit adapter/webhook, add libraries.
```
