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

## Quick start untuk UI dev (lokal)

Frontend memanggil `/api` lewat proxy Vite, jadi API + Postgres harus jalan lokal. Tanpa itu login akan error 500.

Prasyarat: Node 20+, pnpm, Docker Desktop (running).

Windows: jalankan `start.bat` (salin `.env`, install, Postgres + MinIO via Docker, migrate + seed demo, lalu `pnpm dev`).

Manual:
```
cp .env.example .env
pnpm install
docker compose -f infra/docker/compose.dev.yml up -d
pnpm db:reset:demo
pnpm dev
```

- Courier PWA http://localhost:5173, Admin http://localhost:5174, Customer http://localhost:5175, API http://localhost:3000
- Login demo: password `demo1234`; email `super@2m.local` (super admin), `admin@2m.local` (admin cabang); kurir/customer memakai nomor HP di `db/seeds/demo/constants.ts` (mis. `081200000011`).
- Jangan commit `.env`. Key Xendit boleh kosong untuk dev.
- Tanpa Docker: isi `DATABASE_URL` di `.env` dengan Postgres lain (lokal/Neon), lalu `pnpm db:reset:demo`. Upload foto bukti (MinIO) tidak berfungsi.
- Edit UI cukup di `apps/*/src`; Vite hot-reload otomatis.
# 2m-online-shopping-app
# 2m-online-shopping-app
