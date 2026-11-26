# Sumber data, dataset, API, dan library

Setiap sumber baru dicatat di sini pada commit yang sama dengan kode yang memakainya.

## Library

| Nama | Versi | Lisensi | Dipakai di | Untuk apa |
|---|---|---|---|---|
| [pdfkit](https://github.com/foliojs/pdfkit) | ~0.17.2 | MIT | `apps/api` (`modules/earnings/slip.ts`) | Membuat slip penarikan saldo kurir (PDF A5) di server. Pure JavaScript, font bawaan Helvetica, tanpa dependensi native |
| [@types/pdfkit](https://www.npmjs.com/package/@types/pdfkit) | ^0.17.7 | MIT | `apps/api` (dev) | Tipe TypeScript untuk pdfkit |

## Dataset

| Nama | Asal | Lisensi | Dipakai di | Untuk apa |
|---|---|---|---|---|
| `data-science/datasets/dataset_intent_clean_pp4.csv` | Dibuat tim (DS: Dian, Ida; AE: Naufal), sintetis, 508 baris. Disalin dari Drive tim 2026-11-26 | Milik tim, data buatan tanpa PII | `data-science/scripts/build_intent_v1.py` | Sumber dataset intent gabungan DS + AE |
| `data-science/datasets/intent_v1.csv` | Turunan berkas di atas lewat `build_intent_v1.py` (493 baris) | Milik tim | Model intent ml-api (WP-11/12) | Latih dan uji klasifikasi intent; `test_beku` dibekukan |
