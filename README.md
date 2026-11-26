# 2M Sembako — Pemesanan Online dan Kurir Mandiri

Aplikasi pemesanan sembako online untuk toko 2M dengan pengiriman oleh kurir mandiri, dengan banyak cabang.

## Masalah dan pengguna

- **Masalah:** pelanggan UMKM dan rumah tangga sulit memesan sembako secara online dengan alamat yang jelas, sementara toko belum punya sistem untuk mengatur kurir sendiri, mencatat pengiriman, dan menarik saldo.
- **Pengguna:**
  - *Pelanggan*: memesan, membayar, dan melacak pesanan (`apps/customer-web`).
  - *Kurir*: menerima dan memproses pengiriman, mencatat saldo dan penarikan (`apps/courier-pwa`).
  - *Admin cabang / super admin*: mengelola katalog, kurir, dan pesanan (`apps/admin-web`).
- **Mode demo:** pembayaran berjalan dalam mode simulasi (`PAYMENT_PROVIDER=mock`). Order hasil simulasi ditandai `is_demo_payment`.

## Asisten chatbot dan model (placeholder)

Bagian ini diisi sepanjang pengerjaan. Isi final ditulis di WP-60.

- **Masalah yang diselesaikan model:** *(belum diisi, akan ditulis setelah WP-12)*
- **Data:** *(belum diisi; lihat `docs/SOURCES.md` dan `data-science/data_dictionary.md`)*
- **Perbandingan model:** *(belum diisi)*
- **Contoh request dan response:** *(belum diisi)*

## URL publik

- *(belum diisi; diisi setelah deploy WP-20)*

## Struktur

- `apps/` — customer-web, courier-pwa, admin-web, api (Express; entrypoint `server.ts` dan `worker.ts`)
- `services/ml-api` — FastAPI (Python), layanan model internal
- `packages/` — `shared` (contracts, api-client, constants, money), `config`
- `db/` — migrasi, seed, metrics view
- `data-science/` — notebook dan data (tidak di-deploy)
- `contracts/` — OpenAPI ml-api dan changelog
- `infra/` — docker, nginx, script
- `docs/` — laporan, ADR, SOP, runbook, dan `SOURCES.md` (daftar sumber data, API, dan library)

Capacitor/Android untuk courier-pwa adalah Fase 2, belum dibuat.

## Cara menjalankan (lokal)

Frontend memanggil `/api` lewat proxy Vite, jadi API dan Postgres harus jalan lokal. Tanpa itu login akan error 500.

Prasyarat: Node 20+, pnpm, Docker Desktop (sedang berjalan).

Windows: jalankan `start.bat` (menyalin `.env`, install, Postgres dan MinIO lewat Docker, migrasi dan seed demo, lalu `pnpm dev`).

Manual:

```
cp .env.example .env
pnpm install
docker compose -f infra/docker/compose.dev.yml up -d
pnpm db:reset:demo
pnpm dev
```

- Courier PWA http://localhost:5173, Admin http://localhost:5174, Customer http://localhost:5175, API http://localhost:3000
- Login demo: password `demo1234`; email `super@2m.local` (super admin) dan `admin@2m.local` (admin cabang). Kurir dan customer memakai nomor HP di `db/seeds/demo/constants.ts` (mis. `081200000011`).
- Jangan commit `.env`. Key Xendit boleh kosong untuk dev.
- Tanpa Docker: isi `DATABASE_URL` di `.env` dengan Postgres lain (lokal atau Neon), lalu `pnpm db:reset:demo`. Upload foto bukti (MinIO) tidak berfungsi.
- Edit UI cukup di `apps/*/src`; Vite hot-reload otomatis.

## Sumber dan lisensi

Setiap dataset, API, dan library dicatat di [`docs/SOURCES.md`](docs/SOURCES.md) beserta lisensinya.

## Keterbatasan

- Data intent adalah data buatan tim (tanpa PII), belum data asli.
- Layanan gratis di Render dapat tertidur saat tidak dipakai (cold start).
