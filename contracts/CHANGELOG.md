# Contract changelog

Perubahan pada `contracts/` dicatat di sini dan ditandai ke FS (Alga) dan DS (Ida). Kontrak adalah sumber kebenaran: kode yang menyimpang mengikuti kontrak, atau kontrak diubah di commit yang sama.

## ml-api 0.2.0 (2026-11-26, draf, menunggu persetujuan)

Penyelarasan dengan kamus DS (`kamus_data.csv`, `kamus_data_model.csv`) dan keputusan D1–D9 yang dikunci 2026-11-24. Asumsi D1, D2, D4 di 0.1.0 kini terkonfirmasi.

ETA (`POST /v1/predict/eta`), **breaking** terhadap 0.1.0:

- Definisi target berubah. `eta_minutes` sekarang menit dari kurir mengklaim pesanan (ACCEPTED → PICKING) sampai DELIVERED, sama dengan label DS `target_eta_menit`. Sebelumnya PAID → DELIVERED. Alasan: waktu sebelum klaim (bayar, diterima cabang, antre di job pool) tidak dimodelkan simulator, dan `motor_cluster` baru diketahui setelah klaim.
- `hour` menjadi number (jam desimal, 17.5 = 17:30), mengikuti kolom DS `jam`. `hour` dan `dow` diambil dari saat klaim, bukan saat PAID.
- `weight_kg` boleh null. ml-api mengimputasi median train (kolom DS `berat_estimasi`).
- Fitur DS yang **tidak** disajikan di v0.2: `cabang_id` (kode dummy C01–C07 tidak bisa dipetakan ke UUID cabang di app) dan `is_macet` (tidak ada sumber lalu lintas real-time saat prediksi). Model yang disajikan dilatih tanpa keduanya.
- Fitur rekayasa DS (`jarak_log1p`, `jam_sin/cos`, `hari_sin/cos`, `is_jam_puncak`, `is_sabtu`, `kelas_jarak`, `berat_per_item`) dihitung di dalam ml-api dari field request, bukan dikirim Node.
- Respons menambah `eta_range_minutes` (`[bawah, atas]` = prediksi ± RMSE test beku, bawah minimal 1) dan `weight_imputed` (dari `berat_estimasi` DS). Keduanya dipakai halaman tracking dan admin-web.
- Implementasi DS PP6 (`eta_inferensi.prediksi_eta`, endpoint `/v1/eta`, field Bahasa Indonesia, `cabang_id` wajib, `order_id`) **tidak** menjadi kontrak. ml-api memakai adapter: field kontrak dipetakan ke nama DS (tabel di `data-science/data_dictionary.md`), `cabang_id` diisi kategori tak dikenal sehingga one-hot cabang bernilai nol, `eta_menit` dibulatkan ke atas menjadi `eta_minutes`, dan `model_versi` menjadi `model_version`. `order_id` tidak dikirim karena bukan fitur dan termasuk kode pesanan.

Intent: tidak ada perubahan bentuk. Nama kelas kontrak (`cek_pesanan`, `tanya_ongkir`, `tanya_produk`, `info_umum`, `komplain`, `di_luar_konteks`) dipakai juga sebagai label dataset DS.

Penamaan: file dataset DS memakai nama kolom Bahasa Indonesia, API memakai nama Inggris. Pemetaannya ada di `data-science/data_dictionary.md`.

Direncanakan untuk WP-15 (zod, bukan berkas ini): `POST /api/v1/assistant/ask` menambah `remaining_today` (sisa kuota harian pengguna) untuk UI.

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
