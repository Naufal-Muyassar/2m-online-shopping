# 2M Sembako – Engineering Instructions

Applies to every request in this repo. These rules override your defaults.

## 1. Mission

Multi-branch grocery delivery app. Delivery is done by contracted partner couriers on their own motorcycles, using our **Courier PWA**.

**Priority: Courier PWA + the backend path it depends on, demo-ready 31 Oct 2026 (feature freeze 29 Oct).** Customer web, Xendit payments, stock reservation, AI/ML and analytics come after that path works, but the repo and DB are structured for them from day one.

## 2. Stack (fixed – add no libraries beyond these unless the prompt says so)

- Monorepo: pnpm workspaces. Node 20. TypeScript `strict` everywhere. Vitest for tests.
- API: Express, `pg` (raw SQL, no ORM), node-pg-migrate (SQL migrations), zod, pino, jsonwebtoken, bcryptjs, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.
- Frontends: Vite + React 18 + TS, React Router, TanStack Query, Axios, React Hook Form + zod, Tailwind + shadcn/ui. zustand for the customer cart only. Courier PWA also: `vite-plugin-pwa`, `browser-image-compression`.
- Data: PostgreSQL 16; MinIO (S3-compatible) in dev; Redis only when a prompt says so.
- `services/ml-api` (FastAPI) is scaffold-only until told otherwise.
- Language: code, identifiers, comments, migrations in English. User-facing UI copy in Indonesian.

## 3. Repo layout

```
apps/
  courier-pwa/    ACTIVE   src/{app,features,tracking,platform,lib,components/ui}
  admin-web/      ACTIVE (minimal)
  customer-web/   LATER (minimal)
  api/            ACTIVE   src/{server.ts,worker.ts,config,shared,modules/*}
services/ml-api/  SCAFFOLD
packages/shared/  ACTIVE   src/{contracts,constants,api-client,money.ts}
packages/config/  ACTIVE   tsconfig, eslint, tailwind preset
db/{migrations,seeds,metrics}   infra/{docker,nginx,scripts}   docs/{adr,runbook,reports}
```

- API modules ACTIVE: auth, orders, dispatch, courier, admin, events (outbox), branches. LATER: catalog, cart, address, pricing, payments, inventory. SCAFFOLD: abuse, ai-gateway, cash-recon, notifications, refunds.
- Module shape: `routes.ts`, `service.ts`, `repo.ts` (raw parameterised SQL), `*.test.ts`.
- **Every endpoint's request/response zod schema lives in `packages/shared/src/contracts/` and is imported by both API and frontends.**
- A SCAFFOLD folder contains only a `README.md` of exactly 3 lines: owner, trigger to start, depends-on. No placeholder code.

## 4. Hard rules (invariants)

1. **One choke point for order status:** `transition(tx, { orderId, to, actor, meta })` in `apps/api/src/modules/orders`. No other code writes `orders.status`.
2. **Atomicity:** every transition is ONE DB transaction containing: conditional `UPDATE orders SET status=:to WHERE id=:id AND status=:from` (affected rows must be 1), an `order_state_transitions` row, and an `outbox_events` row. Admin-sensitive actions also write `audit_logs` in the same transaction.
3. **Outbox is only for side-effects that leave the DB** (notifications, payment-gateway calls, stock commit). Analytics data is the rows themselves (`order_state_transitions`, `courier_pings`). Never build a Postgres→Postgres copy pipeline. Worker: `SELECT … WHERE status='PENDING' AND next_retry_at<=now() ORDER BY seq LIMIT n FOR UPDATE SKIP LOCKED`, exponential backoff, FAILED after N attempts, handlers idempotent.
4. **Server derives money, distance and weight.** Ignore any client-sent price/fee/distance/weight. Money = integer rupiah via `packages/shared/src/money.ts`. No floats.
5. **Time:** `timestamptz` only. `server_ts` comes from DB `now()`; client time is stored separately as `client_ts`.
6. **Branches are data:** every operational table has `branch_id`. No `if (branch === …)`. Branch scoping comes from the token, never from a request parameter.
7. **Idempotency:** the client generates `idempotency_key` (uuid) once per user action and reuses it on retry. Unique per `(order_id, idempotency_key)`. A replay returns the original result, creates nothing.
8. **Secrets:** none in the repo. Env validated with zod at boot. Keep `.env.example` current. Never log tokens, passwords, phone numbers or addresses.
9. **Immutability:** `audit_logs` and `order_state_transitions` are append-only (DB trigger rejects UPDATE/DELETE).
10. **API conventions:** prefix `/api/v1`, snake_case JSON, errors `{ "error": { "code", "message", "details"? } }`, zod validation on every input, `Authorization: Bearer <access_token>`.
11. **Auth:** password login for now. Access token 15 min (kept in memory by clients). Rotating refresh token stored hashed in a `sessions` table, delivered as `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` cookie. Token claims: `sub`, `role`, `branch_id`, `partner_id?`. Frontends call `/api` same-origin (Vite dev proxy / Nginx / host rewrite).

## 5. Domain spec

**Order states (11):** CREATED, PENDING_PAYMENT, PAID, ACCEPTED, PICKING, READY, ASSIGNED, ON_DELIVERY, DELIVERED, FAILED, CANCELLED. DELIVERED, FAILED, CANCELLED are terminal. READY and ASSIGNED stay in the enum but are DORMANT (old FIFO dispatch; `FIFO_TRANSITIONS_DORMANT` is exported and unused). Flow: PAID → (admin) ACCEPTED = job pool → (courier claims) PICKING → (courier "Jalan") ON_DELIVERY → DELIVERED | FAILED.

**Allowed transitions** (`ACTIVE_TRANSITIONS`; anything else → 409 `INVALID_TRANSITION`):

| From → To | Allowed actor | Requires |
|---|---|---|
| CREATED → PENDING_PAYMENT | system | invoice data (id, url, expires_at) |
| CREATED → CANCELLED | system, customer | reason |
| PENDING_PAYMENT → PAID | system, super_admin (demo "force paid", audited) | – |
| PENDING_PAYMENT → CANCELLED | system, customer | reason |
| PAID → ACCEPTED | branch_admin | – (sets `accepted_at`) |
| PAID → CANCELLED | branch_admin, super_admin | reason |
| ACCEPTED → PICKING | courier (claim), branch_admin (manual assign, audited) | courier IDLE in the order's branch; admin passes `courier_id` |
| ACCEPTED → CANCELLED | branch_admin, super_admin | reason |
| PICKING → ACCEPTED | courier (assigned), branch_admin | reason; audited; courier → IDLE |
| PICKING → ON_DELIVERY | courier (the assigned one) | every item `picked_qty >= qty` (else 409 `PICKING_INCOMPLETE`); lat, lng |
| PICKING → CANCELLED | super_admin | reason; courier → IDLE |
| ON_DELIVERY → DELIVERED | courier (the assigned one) | photo proof registered, lat, lng |
| ON_DELIVERY → FAILED | courier (the assigned one) | reason enum + proof or note; sets `return_pending = true` |

Failed reasons: `CUSTOMER_UNREACHABLE`, `ADDRESS_NOT_FOUND`, `REFUSED`, `OTHER`. There is no RETURNING state: use the `orders.return_pending` flag.

**Roles:** `customer`, `courier`, `branch_admin` (scoped to one branch), `super_admin` (all branches).

**Courier status:** `IDLE | DELIVERING | OFFLINE`. A courier toggles IDLE↔OFFLINE only when not DELIVERING. Claiming (ACCEPTED→PICKING) sets DELIVERING; releasing sets IDLE. DELIVERED sets IDLE unless `return_pending`; a failed order keeps the courier DELIVERING until a branch admin calls `confirm-return`. `last_status_change` is updated on every courier status change.

**Claim model (replaces FIFO dispatch), one order per courier, one transaction:** the order row is locked first, then the courier row (`order → courier`, always). The conditional `UPDATE … WHERE status='ACCEPTED'` plus the locks make exactly one concurrent claimant win; the rest get 409 `JOB_TAKEN`; a non-IDLE courier gets 409 `COURIER_BUSY`. The `dispatch` module is dormant: unmounted, no call sites, tests in `apps/api/test/dormant/` (excluded from the default run).

**Courier API contract:**

- `GET /api/v1/courier/jobs` → `{ jobs, can_claim, reason? }`. IDLE courier: ACCEPTED, unassigned orders of own branch, `accepted_at ASC`, max 20, each `{ id, code, accepted_at, item_count, total_weight_kg, route_distance_km, courier_wage, area_hint }` (no receiver name/phone, full address or pin). Not IDLE: `{ jobs: [], can_claim: false, reason: 'OFFLINE' | 'BUSY' }`.
- `POST /api/v1/courier/jobs/:id/claim` body `{ lat, lng, accuracy, client_ts, idempotency_key }` → order detail (now with receiver, address, pin, items with `picked_qty`).
- `PATCH /api/v1/courier/orders/:id/items/:itemId` body `{ picked_qty }` (assigned courier, only while PICKING, `0 <= picked_qty <= qty`). `POST …/orders/:id/release` body `{ reason }` (PICKING→ACCEPTED).
- `GET /api/v1/courier/orders`: active = PICKING, ON_DELIVERY, or FAILED with `return_pending`.
- `POST /api/v1/courier/orders/:id/status` body `{ to, lat, lng, accuracy, client_ts, idempotency_key, reason? }`; `to` ∈ ON_DELIVERY | DELIVERED | FAILED (ON_DELIVERY valid from PICKING).
- `POST /api/v1/courier/orders/:id/proof/upload-url` → `{ upload_url, photo_key }` (signed PUT; the file goes straight to object storage, never through Node). `POST …/proof` `{ photo_key, lat, lng }` registers it (ON_DELIVERY only). DELIVERED requires a registered proof.
- `POST /api/v1/courier/pings` body `{ pings: [{ lat, lng, accuracy, battery?, order_id?, client_ts }] }` → `courier_pings` table (not the outbox).
- Admin: `POST /api/v1/admin/orders/:id/transition` accepts only `to: ACCEPTED`; `POST …/assign` `{ courier_id }` (ACCEPTED→PICKING); `POST …/release` `{ reason }` (PICKING→ACCEPTED); `confirm-return` unchanged.

## 6. Demo scope (31 Oct)

**IN:** courier login, IDLE/OFFLINE toggle, assigned-order list/detail (polling ~10 s), Google Maps deep link for navigation, status buttons following the state machine, photo proof (compressed ≤ ~300 KB), GPS attached to every status change, foreground ping every ~3 min, admin board (accept/pick/ready, courier list, reassign, demo "force paid"), outbox worker.

**OUT until a prompt says otherwise:** offline queue/IndexedDB, FCM push, background location, COD/cash reconciliation, short pick/substitution, refunds, vouchers/anti-abuse, OTP login or OTP proof, notifications, LLM features, Metabase.

## 7. How you work (strict – saves credits)

- Complete the whole prompt in one run. Never ask questions or for confirmation. If something is ambiguous, choose the simplest option consistent with this file and append one line to `docs/ASSUMPTIONS.md`.
- Do not add fallback paths, defensive checks, retries, feature flags or abstractions that are not specified. Robustness items listed in this file or the prompt ARE required.
- Do not re-verify your own work in loops. Run `pnpm typecheck` once at the end, plus only the tests the prompt names, once. If something fails, fix it and re-run once.
- Do not create README/docs/changelogs/comments beyond what the prompt asks. Comment only non-obvious invariants.
- Stay inside the prompt's scope. No refactors, renames, extra dependencies, or edits to unrelated files. No git commands.
- Keep existing folders and files (.env.example, README.md, CODEOWNERS, pnpm-workspace.yaml, contracts/, data-science/). Only add what is missing and extend; never overwrite.
- Final reply: at most 12 lines — what was created, assumptions added, anything not done. No code dump.
