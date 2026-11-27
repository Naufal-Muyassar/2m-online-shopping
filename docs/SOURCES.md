# Sumber data, dataset, API, dan library

Setiap sumber baru dicatat di sini pada commit yang sama dengan kode yang memakainya.

## Library

| Nama | Versi | Lisensi | Dipakai di | Untuk apa |
|---|---|---|---|---|
| [pdfkit](https://github.com/foliojs/pdfkit) | ~0.17.2 | MIT | `apps/api` (`modules/earnings/slip.ts`) | Membuat slip penarikan saldo kurir (PDF A5) di server. Pure JavaScript, font bawaan Helvetica, tanpa dependensi native |
| [@types/pdfkit](https://www.npmjs.com/package/@types/pdfkit) | ^0.17.7 | MIT | `apps/api` (dev) | Tipe TypeScript untuk pdfkit |
| [FastAPI](https://github.com/fastapi/fastapi) | >=0.115,<1 | MIT | `services/ml-api` | Kerangka REST API dan Swagger (`/docs`). Membawa Pydantic (MIT) dan Starlette (BSD-3-Clause) |
| [Uvicorn](https://github.com/encode/uvicorn) | >=0.32,<1 | BSD-3-Clause | `services/ml-api` | Server ASGI |
| [pytest](https://github.com/pytest-dev/pytest) | >=8,<10 | MIT | `services/ml-api` (dev) | Tes |
| [HTTPX](https://github.com/encode/httpx) | >=0.27,<1 | BSD-3-Clause | `services/ml-api` (dev) | Dipakai `TestClient` FastAPI |
| [python:3.12-slim](https://hub.docker.com/_/python) | 3.12 | PSF (Python) dan lisensi paket Debian | `services/ml-api/Dockerfile` | Image dasar |

## API eksternal

| Nama | Lisensi / ketentuan | Dipakai di | Untuk apa |
|---|---|---|---|
| [openrouteservice Directions](https://openrouteservice.org/dev/#/api-docs/v2/directions) (HeiGIT), profil `driving-car` | Paket Standard gratis dengan API key (kuota harian dan per menit); data © OpenStreetMap contributors (ODbL) | `apps/api` (`modules/routing`) | Rute jalan utama untuk jarak tersisa, ETA, dan garis rute di peta tracking. Hanya koordinat kurir dan tujuan yang dikirim |
| [OSRM](https://project-osrm.org/) server demo `router.project-osrm.org` | Software BSD-2-Clause; server demo tanpa key, tanpa SLA, hanya untuk pemakaian ringan; data © OpenStreetMap contributors (ODbL) | `apps/api` (`modules/routing`) | Cadangan bila openrouteservice gagal, kena batas, atau tanpa key. Bisa diganti server OSRM sendiri lewat `OSRM_BASE_URL` |

## Dataset

| Nama | Asal | Lisensi | Dipakai di | Untuk apa |
|---|---|---|---|---|
| `data-science/datasets/dataset_intent_clean_pp4.csv` | Dibuat tim (DS: Dian, Ida; AE: Naufal), sintetis, 508 baris. Disalin dari Drive tim 2026-11-26 | Milik tim, data buatan tanpa PII | `data-science/scripts/build_intent_v1.py` | Sumber dataset intent gabungan DS + AE |
| `data-science/datasets/intent_v1.csv` | Turunan berkas di atas lewat `build_intent_v1.py` (493 baris) | Milik tim | Model intent ml-api (WP-11/12) | Latih dan uji klasifikasi intent; `test_beku` dibekukan |
