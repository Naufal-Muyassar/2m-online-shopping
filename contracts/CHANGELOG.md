# Contract changelog

Perubahan pada `contracts/` dicatat di sini dan ditandai ke FS (Alga) dan DS (Ida). Kontrak adalah sumber kebenaran: kode yang menyimpang mengikuti kontrak, atau kontrak diubah di commit yang sama.

## ml-api 0.1.0 (2026-11-08, draf, menunggu persetujuan)

Draf pertama `ml-api.openapi.json` dari bagian 8 `docs/PROJECT_PLAN.md` (WP-02).

- Endpoint: `GET /health`, `POST /v1/intent`, `POST /v1/chat`, `POST /v1/predict/eta`.
- Semua `/v1` memakai header `X-Internal-Key`. `/health` terbuka untuk probe hosting dan hanya berisi versi serta status up/down.
- Semua respons sukses `/v1` membawa `model_version`.
- Bentuk error sama dengan Node: `{ error: { code, message, details? } }`. Kode: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `AI_INPUT_TOO_LONG` (413), `AI_BUDGET_EXCEEDED` (429), `AI_UNAVAILABLE` (503), `AI_TIMEOUT` (504), `INTERNAL` (500). Error 422 bawaan FastAPI harus dipetakan ke `VALIDATION_ERROR` 400.
- Kelas intent dikunci sebagai enum: `cek_pesanan`, `tanya_ongkir`, `tanya_produk`, `info_umum`, `komplain`, `di_luar_konteks`.

Tambahan dan ketetapan di luar draf bagian 8 (perlu disetujui):

- Batas panjang: `text` dan `message` maksimal 500 karakter, `history` maksimal 6 giliran, tiap giliran maksimal 1000 karakter. `alternatives` maksimal 2.
- `/v1/chat` mengembalikan `model_version` seperti endpoint lain.
- `usage.model = "extractive"` dan token 0 bila jawaban berasal dari fallback ekstraktif tanpa panggilan LLM.
- `AI_UNAVAILABLE`, `AI_TIMEOUT`, dan `AI_BUDGET_EXCEEDED` hanya dikirim bila fallback pun tidak bisa menjawab. Kalau fallback bisa, respons tetap 200 dengan `fallback_used: true`.
- ETA: `hour` dan `dow` dalam waktu Asia/Jakarta, `dow` 0 = Senin. `motor_cluster` bernilai `A`, `B`, atau null (mengikuti `couriers.motor_cluster`). `eta_minutes` adalah menit dari PAID sampai DELIVERED, dibulatkan ke atas.

Asumsi: rekomendasi D1 (chatbot FAQ + RAG), D2 (intent sebagai model utama, ETA dari DS), dan D4 (embedding API + FAISS). Ketiganya masih Terbuka di bagian 5 plan. Bila keputusan berbeda, kontrak ini diubah dulu sebelum WP-10.

Belum termasuk: endpoint Node publik `/api/v1/assistant/*` dan tabel `llm_usage`. Keduanya didefinisikan di zod `packages/shared/src/contracts` dan migrasi pada WP-15.

Persetujuan:

| Peran | Nama | Tanggal |
|---|---|---|
| AE | Hafizh | |
| FS | Alga | |
| DS | Ida | |
