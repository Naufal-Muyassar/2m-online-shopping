# Grocery Delivery

Monorepo (pnpm workspace) — lihat struktur di bawah.

- `apps/` — customer-web, courier-pwa, admin-web, api (Express; entrypoint `server.ts` & `worker.ts`)
- `services/ml-api` — FastAPI (Python)
- `packages/` — `shared` (contracts, api-client, constants, money), `config`
- `db/` — migrations, seeds, metrics views
- `data-science/` — notebooks & data (tidak di-deploy)
- `contracts/` — OpenAPI ml-api + changelog
- `infra/` — docker, nginx, scripts
- `docs/` — reports, adr, sop, runbook

Capacitor/android (courier-pwa) adalah Fase 2, belum dibuat.
# 2m-online-shopping-app
# 2m-online-shopping-app
