# Playbook Eksekusi — Capstone 2M Sembako

Rujukan sebelum membuka sesi baru. Dibuat 8 Nov 2026, mengacu ke `PROJECT_PLAN.md`.

## 1. Mekanisme kerja

- **Satu sesi = satu WP.** Buka sesi baru per paket kerja. Kalau satu WP butuh lebih dari satu sesi, simpan progres sebagai baris di bagian 9 plan, jangan mengandalkan riwayat obrolan.
- **Alur per WP:** rencana singkat → implementasi → `typecheck` / `test` / `lint` di stack lokal → commit conventional → centang WP + 1 baris log.
- **Gerbang sebelum WP pertama:** `DATABASE_URL` menunjuk DB lokal, dan baseline tes sudah dijalankan sekali (Prompt D). Tanpa baseline, regresi tidak bisa dibedakan dari kondisi awal yang memang sudah rusak.
- **Eskalasi:** Sonnet gagal dua kali pada masalah yang sama → pindah ke Opus High dengan Prompt F. Jangan mulai dari Opus kecuali WP ada di daftar Opus.
- **Review manual sebelum merge:** diff WP-02 (kontrak), WP-14 (PII dan fallback), WP-15 (`llm_usage`, batas harian). Tiga ini paling mahal kalau salah dan paling sulit ditangkap tes.
- **Perubahan di `contracts/`** lewat PR yang ditandai ke FS (Alga) dan DS (Ida). WP-02 baru selesai bila tiga LP menyetujui.
- **Hitung ulang bagian 3.4 per akhir tahap**, bukan per WP (Prompt E).
- **Tidak didelegasikan ke model:** WP-01 (keputusan D1–D9) dan D8 (tenggat). Model hanya bisa mencatat keputusan, bukan membuatnya.

## 2. Alokasi model

Default: **Sonnet 5.5, effort Medium**. Opus 5.5 hanya untuk kontrak, desain WP-14, dan eskalasi debug. Haiku 5.5 untuk pekerjaan mekanis bervolume. **Fable 5.1 tidak dipakai**: butuh usage credits, dan tidak ada WP yang bottleneck-nya reasoning di atas level Opus.

| WP | Model | Effort | Baca bagian 8 | Catatan |
| --- | --- | --- | --- | --- |
| Baseline tes | Sonnet | Low | – | Prompt D, sekali sebelum WP-02 |
| WP-01 | – | – | – | Manual: lu yang memutuskan |
| WP-02 | Opus | High | ✔ | Kontrak OpenAPI + data dictionary (Prompt B) |
| WP-03 | Haiku | Low | – | README dan `docs/SOURCES.md`; baca hasilnya, jangan langsung dipercaya |
| WP-10 | Sonnet | Medium | ✔ | FastAPI, Dockerfile, CI; tes pakai pytest |
| WP-11a | Haiku | Low | – | Generate data mentah (Prompt G) |
| WP-11b | Sonnet | Medium | – | Dedupe, split per grup, tes kebocoran (Prompt H) |
| WP-12 | Sonnet | Medium | – | Tiga model, split dan metrik sama; opsi C tanpa torch |
| WP-13 | Sonnet | Medium | ✔ | `/v1/intent` + uji panggil dari Node |
| WP-14 desain | Opus | High | ✔ | Design doc saja, tanpa kode (Prompt C1) |
| WP-14a | Sonnet | Medium | ✔ | Retrieval + fallback ekstraktif (Prompt C2) |
| WP-14b | Sonnet | Medium | ✔ | Lapisan LLM + circuit breaker |
| `knowledge/*.md` | Haiku | Low | – | Isi dari fakta nyata 2M; jangan mengarang kebijakan |
| WP-15 | Sonnet | Medium | ✔ | Migrasi, route, zod, tes dengan ml-api palsu |
| WP-16 | Sonnet | Medium | ✔ | UI; uji di ponsel secara manual |
| WP-20 | Sonnet | Medium | – | Naik ke Opus bila buntu dua kali (Prompt F) |
| WP-21 | Sonnet | Low | – | Jalankan dan simpan laporan |
| WP-22, 23 | Sonnet | Medium | – | Audit dan halaman bantuan |
| WP-30–33, 44 | Sonnet | Medium | – | Dimiliki DS; repo hanya menyediakan struktur |
| WP-40, 43 | Sonnet | Medium | ✔ | Telegram, saklar `AI_CHAOS`, Swagger |
| WP-41 | Haiku (data), Sonnet Low (`run_eval.py`) | Low | – | `oos.jsonl` ≥10 pertanyaan |
| WP-42 | Sonnet | Medium | – | `class_weight`, tuning, hasil di test beku |
| WP-45 | Sonnet | Medium | ✔ | Spesifikasi dataset ETA ada di bagian 8 |
| WP-46 | Sonnet | Low | – | Audit skema zod per route |
| WP-60–62 | Haiku | Low | – | README final, Trello, skrip demo |

## 3. CLAUDE.md (draf siap tempel)

Letakkan di root repo. Isi bagian Keputusan setelah WP-01, supaya bagian 5 plan tidak perlu dibaca tiap sesi. Jaga ±35 baris; kalau melar, token yang dihemat di prompt habis di setiap sesi.

```markdown
# 2M Sembako: aturan kerja

Status dan paket kerja ada di PROJECT_PLAN.md. Jangan baca seluruhnya; baca hanya bagian yang disebut di prompt.

## Perintah
- `pnpm typecheck`, `pnpm test`, `pnpm lint`
- Stack lokal: `pnpm local:up`, `local:reset`, `local:api`, `local:web` (proyek Docker 2m-local)

## Larangan keras
- Jangan jalankan `db:reset*` dengan `.env` root: menunjuk Supabase hosted dan menghapus seluruh skema. Test API membaca `.env`, jadi arahkan `DATABASE_URL` ke DB lokal lebih dulu.
- Jangan deploy atau push tanpa diminta.
- Jangan kirim PII (nama, telepon, alamat, kode pesanan) ke LLM atau simpan di `llm_usage` tanpa disamarkan.

## Arsitektur
- Monorepo pnpm. API Express di `apps/api`. Kontrak zod di `packages/shared/src/contracts` (JSON snake_case). Frontend memanggil `/api/v1` lewat `packages/shared/src/api-client`.
- Error: `AppError(status, code, message)` di `apps/api/src/shared/errors.ts`; frontend memetakan kode ke Bahasa Indonesia di `lib/api.ts` tiap app.
- Migrasi: `.sql` bernomor di `db/migrations`, maju saja (berikutnya `1761000000012_*`).
- ml-api (`services/ml-api`) internal: hanya Node yang memanggil (`X-Internal-Key`). Frontend tidak memegang kunci LLM.
- ml-api: tanpa torch/transformers. Embedding lewat API, FAISS cpu. Target RAM di bawah 512 MB (Render free).

## Konvensi
- Teks untuk pengguna: Bahasa Indonesia.
- Pembayaran: `PAYMENT_PROVIDER=mock`, `DEMO_MODE=true` adalah jalur resmi.
- Commit conventional (`feat(scope): ...`). Sumber data/dataset/API/library baru dicatat di `docs/SOURCES.md` pada commit yang sama.
- Dataset di `data-science/datasets/` (bukan `data-science/data/`, itu di-ignore git).

## Keputusan (satu baris per ID, isi setelah WP-01)
- D1 fitur generatif:
- D2 model utama:
- D3 LLM:
- D4 embedding / vector DB:
- D5 kanal:
- D6 hosting:
- D7 pembagian AE:
- D8 tenggat:
- D9 sumber data awal:
```

## 4. Template prompt

Ganti `{xx}` dengan nomor WP. Untuk WP Python, pakai `pytest` di `services/ml-api` sebagai pengganti `pnpm test`.

### Prompt A: WP biasa

```
Kerjakan WP-{xx} (bagian 6 PROJECT_PLAN.md; cari `WP-{xx}`, jangan baca bagian lain).
Ikuti CLAUDE.md. Hanya sentuh file yang disebut di WP itu; kalau perlu file lain, sebut alasannya dulu.
Urutan: (1) rencana maksimal 8 baris, (2) kerjakan, (3) jalankan pnpm typecheck && pnpm test && pnpm lint dengan DATABASE_URL lokal, (4) perbaiki sampai hijau, atau laporkan jujur apa yang gagal dan kenapa, (5) commit conventional.
Penutup: centang WP-{xx} di bagian 6, ubah status butir terkait di bagian 3 (tanpa menghitung ulang 3.4), tambah 1 baris di bagian 9. Jangan ubah bagian lain.
Berhenti dan tanya hanya bila terblokir keputusan D1–D9 yang masih terbuka.
Laporan akhir maksimal 10 baris: file yang berubah, hasil tes, dan apa yang belum terverifikasi.
```

### Prompt B: WP yang menyentuh kontrak, tabel, atau dataset

Pakai Prompt A, lalu tambahkan:

```
Baca juga bagian 8 (draf kontrak). Kontrak adalah sumber kebenaran: bila bentuk request/response perlu berubah, ubah contracts/ml-api.openapi.json dan contracts/CHANGELOG.md pada commit yang sama. Jangan menyimpang diam-diam dari kontrak.
```

### Prompt C1: WP berat, fase desain (Opus High, tanpa kode)

```
Jangan menulis kode. Untuk WP-14: baca WP-14, bagian 7, bagian 8, dan contracts/ml-api.openapi.json.
Tulis docs/design/wp-14-llm-rag.md (maksimal 2 halaman): alur request dalam diagram teks; keadaan circuit breaker; skema cache key; aturan penyamaran PII; ambang retrieval dan cara menentukannya; daftar failure mode beserta perilaku tiap kasus (timeout, kuota habis, LLM down, skor retrieval rendah, input terlalu panjang, prompt injection); cara menguji tiap failure mode tanpa LLM asli; urutan implementasi 14a (retrieval + fallback ekstraktif) lalu 14b (lapisan LLM).
Sebut asumsi yang belum terbukti, terutama cold start Render (30–60 dtk) terhadap timeout 3–5 dtk, karena rantai Node → ml-api bisa membuat dua instance tertidur bersamaan.
```

### Prompt C2: fase implementasi (Sonnet Medium, sesi baru)

```
Implementasikan WP-14a sesuai docs/design/wp-14-llm-rag.md. Baca juga bagian 8 PROJECT_PLAN.md dan CLAUDE.md.
Cakupan 14a saja: retrieval dari services/ml-api/knowledge/ dan fallback ekstraktif. Tanpa panggilan LLM. Harus bisa dites penuh tanpa kunci API.
Tulis pytest untuk setiap failure mode di design doc yang relevan dengan 14a. Penutup dan laporan seperti Prompt A.
```

### Prompt D: baseline (Sonnet Low, sekali sebelum WP-02)

```
Tugas baseline, tanpa mengubah fitur apa pun.
1) Pastikan DATABASE_URL menunjuk DB lokal (pnpm local:up, pnpm local:reset). Hentikan dan laporkan jika .env masih menunjuk Supabase.
2) Jalankan pnpm typecheck, pnpm test, pnpm lint, pnpm demo:smoke.
3) Tulis hasil apa adanya ke docs/reports/baseline-{tanggal}.md: perintah, lulus/gagal, dan pesan error pertama tiap kegagalan.
Jangan memperbaiki apa pun.
```

### Prompt E: penutup tahap (Sonnet Low)

```
Hitung ulang bagian 3.4 dari tabel per butir 3.1–3.3: hitung per baris dan tunjukkan hitungannya. Perbarui angka ringkasan di bagian 1. Tambah satu baris di bagian 9. Jangan ubah bagian lain.
```

### Prompt F: eskalasi debug (Opus High)

```
WP-{xx} macet. Gejala: {…}. Yang sudah dicoba: {percobaan 1}, {percobaan 2}. Jangan ulangi keduanya.
Diagnosis dulu: daftar minimal 3 hipotesis berurut kemungkinan, cara termurah untuk membuktikan atau menyangkal masing-masing, lalu jalankan yang termurah. Jangan ubah kode sebelum ada hipotesis yang terbukti.
```

### Prompt G: data intent mentah (WP-11a, Haiku Low)

```
Buat data-science/datasets/intent_v0_raw.csv dengan kolom text,intent,source,group_id. source selalu synthetic.
Kelas: cek_pesanan, tanya_ongkir, tanya_produk, info_umum, komplain, di_luar_konteks. Minimal 60 baris per kelas.
Satu group_id = satu niat dengan 3–5 parafrase (formal, chat santai, slang, typo, singkatan). Tanpa PII; jangan memakai nama, nomor telepon, atau alamat nyata. Contoh kelas di_luar_konteks harus beragam dan tidak selalu ekstrem (termasuk pertanyaan yang mirip topik belanja tapi bukan layanan 2M).
```

Kolom `group_id` adalah tambahan dari spesifikasi WP-11 (`text,intent,source,split`). Catat di `data-science/data_dictionary.md`.

### Prompt H: split anti-kebocoran (WP-11b, Sonnet Medium)

```
Dari data-science/datasets/intent_v0_raw.csv: (1) buang near-duplicate (kemiripan n-gram karakter di atas ambang yang kamu tentukan dan jelaskan), (2) split 70/30 per kelas berdasarkan group_id sehingga tidak ada group_id di dua split, (3) bekukan test dengan menyimpan hash berkas, (4) tulis intent_v1.csv, (5) tulis services/ml-api/app/preprocess.py (lowercase, normalisasi slang, tanpa PII) yang bisa dijalankan ulang, (6) tulis pytest yang gagal bila ada kalimat atau group_id yang sama di train dan test.
Laporkan jumlah baris per kelas sebelum dan sesudah dedupe. Bila ada kelas di bawah 40 baris, laporkan, jangan menambal diam-diam.
```

## 5. Titik rawan yang harus dicek manual

- **Metrik intent yang terlalu bagus.** Macro-F1 mendekati 1.0 pada data sintetik biasanya tanda bocor, bukan model hebat. Curigai hasil itu sebelum menuliskannya di README.
- **Cold start berantai.** Node dan ml-api sama-sama di Render free. Uji request pertama setelah keduanya idle, bukan hanya saat hangat.
- **Dependensi tersembunyi.** Setelah WP-12, cek `pip freeze` dan ukuran image. Kalau torch atau transformers muncul, putar balik sebelum WP-13.
- **Kuota LLM saat demo.** Uji fallback dengan `AI_CHAOS` (WP-43) sebelum hari demo, bukan sesudahnya.
