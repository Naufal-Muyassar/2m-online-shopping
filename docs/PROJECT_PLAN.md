# Project Plan Capstone A26-CS213 — 2M Sembako

> Rujukan utama untuk chat berikutnya. Baca file ini dulu sebelum mengerjakan apa pun yang berkaitan dengan checklist Asah 2026.
> Dibuat 8 Nov 2026. Sumber: checklist `[Asah 2026] Checklist Tech Stack - Tech Stack - 3 LP.csv`, tiga briefing draf (FS, AE, DS, tanggal 8 Nov), board Trello "2M Sembako - Online Shopping App", dan audit repo ini.
> Cara menandai kemajuan: ubah kolom status di bagian 3 dan centang paket kerja di bagian 6. Jangan menulis ulang file ini; tambahkan catatan di bagian 9 (Log).

## 0. Cara pakai di chat berikutnya

- Sebut ID paket kerja, misalnya "kerjakan WP-12". Setiap paket di bagian 6 berisi file yang disentuh, langkah, dan kriteria selesai.
- Status "terverifikasi di repo" di dokumen ini artinya struktur dan kode **dibaca**, bukan dijalankan. Tes, build, dan deploy belum dijalankan saat audit ini dibuat.
- Aturan kerja di repo ada di `CLAUDE.md` (root). Keputusan yang masih terbuka ada di bagian 5; kalau sudah diputuskan, tulis hasilnya di bagian 5 dan 9.

## 1. Ringkasan eksekutif

- Checklist punya **63 butir**: Full-Stack (FS) 22, AI Engineer (AE) 20, Data Science (DS) 21. Main Quest wajib: FS 6, AE 7, DS 7.
- Posisi sebenarnya di repo jauh lebih maju daripada yang tercatat di Trello untuk **FS**, dan hampir kosong untuk **AE** dan **DS**.
  - FS: sisi pelanggan (katalog, keranjang, alamat dengan peta, checkout, bayar simulasi, status dan tracking, chat) sudah ada di kode. Trello dan briefing FS masih menulis "belum tercatat selesai".
  - AE: nol. `services/ml-api/*`, `contracts/*`, `data-science/data_dictionary.md` semuanya file 0 byte. Tidak ada kode AI sama sekali di `apps/` dan `packages/`.
  - DS: nol di repo. Analisis tarif ada di luar repo (`Draft_DS_Kurir_v2.xlsx`). `db/metrics/`, `data-science/notebooks/`, `data-science/sql/` kosong.
- Hitungan status di repo (bagian 3.4, dari 63 butir): Ada 14, Sebagian 2, Perlu verifikasi 0, Belum 47. Yang "Belum" hampir semuanya AE (20) dan DS (21), dan saling bergantung (dataset DS → model AE → serving → integrasi FS).
- Jalur kritis capstone: **kontrak API + format dataset (WP-02) → service FastAPI online (WP-10) → model terlatih + perbandingan (WP-11, WP-12) → chatbot RAG lewat backend (WP-14, WP-15)**. Deploy publik (WP-20) harus dipastikan lebih dulu karena service Python butuh tempat hidup.
- Rekomendasi inti (alasan di bagian 5): satu service FastAPI, satu fitur utama (**asisten chatbot FAQ dengan klasifikasi intent + RAG**) yang menutup sebagian besar butir AE, dan model prediksi ETA sebagai pekerjaan bersama DS di Side Quest.

## 2. Konteks proyek

- Produk: pemesanan sembako online dan kurir mandiri 2M, multi-cabang. Tiga aplikasi web (`customer-web`, `courier-pwa`, `admin-web`), satu API Express, Postgres, Redis, penyimpanan objek untuk foto bukti.
- Tim (dari briefing): FS Alga Firmansyah dan Zoelkiflie Ahmadhani; AE Mohammad Hafizh Ayatillah (juga Project Lead) dan Naufal Muyassar (di Trello tertulis "Noval Muyasar", samakan ejaan); DS Dian Anggun Sari dan Ida Masruroh.
- Remote GitHub: `Naufal-Muyassar/2m-online-shopping`. Git user lokal: `hafizhayatillah-bit`.
- Mode demo: pembayaran **simulasi** (`PAYMENT_PROVIDER=mock`, `DEMO_MODE=true`) adalah jalur resmi. Adapter Xendit ada tetapi ditunda. Order hasil simulasi ditandai `orders.is_demo_payment`.
- Bahasa UI dan pesan error untuk pengguna: Indonesia.
- Catatan Trello yang harus ikut saat update berikutnya: pay kurir untuk order **FAILED** ikut dikreditkan ke saldo (`courier_pay_final = round(courier_wage × failed_pay_fraction)`), selain DELIVERED.

## 3. Matriks checklist: Trello vs repo

Legenda: ✅ ada, 🟡 sebagian, ❌ belum, ❓ perlu verifikasi. Kolom **Trello** diambil dari tiga briefing dan kartu "Checklist Tech Stack". Kolom **Repo** dari audit kode. Tanda ⬆ berarti repo lebih maju daripada Trello (Trello perlu dikoreksi).

### 3.1 Full-Stack (Alga, Zoel)

| ID | Butir | Trello | Repo | Bukti / catatan | WP |
|---|---|---|---|---|---|
| FS-M1 | Satu masalah UMKM yang jelas | ✅ | ✅ | Pesan online + kurir mandiri. `README.md` masih generik ("Grocery Delivery"), tulis ulang | WP-03 |
| FS-M2 | Minimal 2 fitur utama | 🟡 | ✅ ⬆ | `apps/customer-web/src/features/{catalog,cart,checkout,address,orders,chat}`, `courier-pwa`, `admin-web` | – |
| FS-M3 | Hasil sesuai aksi pengguna | 🟡 | ✅ ⬆ | Test API di `apps/api/test/integration/*` (customer-order, order-tracking, mock-payments, dst.) dan `demo:smoke`. Belum dijalankan di audit ini | WP-21 |
| FS-M4 | Tanda berhasil / gagal / diproses | ❌ | 🟡 ⬆ | Toast di 3 app, `States.tsx`, penanda loading di 27 berkas. Belum diaudit konsistensinya | WP-22 |
| FS-M5 | Mudah dipakai UMKM, ada panduan | ❌ | ❌ | Tidak ada halaman bantuan / onboarding | WP-23 |
| FS-M6 | Dapat diakses publik, termasuk ponsel | ❌ | ✅ (laporan pemilik) | `render.yaml` mendefinisikan API + 3 situs statis; `deploy-api.yml` sudah manual-only dengan komentar "API hosted on Render". Log deploy Render 7 Nov 15:33 UTC: build sukses, "Your service is live", API listening di port 3000, worker in-process jalan, "stock counters rebuilt" (30 counter). Tetapi probe `GET https://twom-online-shopping.onrender.com/health` dari mesin ini pada 8 Nov ±04:10–04:17 UTC **tidak dijawab sama sekali (4 percobaan, sampai 170 dtk)**. Pemilik melaporkan situs statis sudah pernah didemokan dan jalan, dan diamnya API pada 8 Nov dinilai cold start free tier | WP-00, WP-20 |
| FS-A1 | FE dan BE terpisah, terhubung lewat network call | 🟡 | ✅ | Monorepo `apps/api` + 3 frontend, proxy `/api` | – |
| FS-A2 | Front-end memakai bundler | cek repo | ✅ | Vite di semua frontend | – |
| FS-A3 | Express + URL `/api/v1/resource` | cek repo | ✅ ⬆ | Semua router di bawah `/api/v1` (`apps/api/src/app.ts`). Teks Trello "endpoint tanpa prefix" sudah usang | – |
| FS-A4 | CSS framework + komponen UI modern | cek repo | ✅ | Tailwind + `class-variance-authority` + `components.json` gaya shadcn, komponen sendiri; tidak ada paket Radix | – |
| FS-A5 | Networking memakai Axios | cek repo | ✅ | `axios` di 4 paket; `packages/shared/src/api-client` | – |
| FS-I1 | Data persisten | ✅ | ✅ | Postgres, 28 tabel (`CREATE TABLE`) di `db/migrations/*` | – |
| FS-I2 | Layanan Gen AI diakses lewat backend | ❌ | ❌ | Belum ada fitur AI. `ML_API_URL` hanya ada di `.env.example` | WP-15 |
| FS-I3 | Hasil DS tampil di fitur relevan | ❌ | ❌ | `admin-web/src/features/metrics-embed/` baru `.gitkeep` | WP-44, WP-45 |
| FS-I4 | Riwayat hasil Gen AI di database | ❌ | ❌ | Tabel `llm_usage` belum ada (hanya di desain Trello) | WP-15 |
| FS-K1 | Backend memvalidasi data dengan schema validation | tidak disebut | ✅ | Memakai **zod** (kontrak di `packages/shared/src/contracts`), setara Joi. Catat di README. Belum dicek apakah semua route tervalidasi | WP-46 |
| FS-K2 | Kegagalan aplikasi dan layanan AI/DS ditangani dengan pesan jelas | ❌ | 🟡 | Pemetaan error → Bahasa Indonesia sudah ada di `lib/api.ts` tiap app; bagian AI/DS menunggu fiturnya | WP-16, WP-43 |
| FS-U1 | Mockup dibuat sebelum pengembangan | ❌ | ❌ | Tidak ada berkas mockup. Ada `docs/DESIGN_SYSTEM.md` (42 KB) yang bisa jadi dasar penjelasan | WP-46 |
| FS-U2 | Responsif dengan keputusan desain jelas | 🟡 | ✅ ⬆ | Redesign + `DESIGN_SYSTEM.md` (token warna, kolom 30rem, admin lebar) | WP-46 (dokumentasi) |
| FS-C1 | Riwayat kode dengan Git/GitHub | ✅ | ✅ | 40 commit | – |
| FS-C2 | Kontrak API/format data disepakati dengan AE dan DS | ❌ | ❌ | `contracts/ml-api.openapi.json` kosong | WP-02 |
| FS-C3 | Deploy ke layanan free tier | ❌ | ✅ (laporan pemilik) | Lihat FS-M6; `render.yaml` memang free tier, tetapi belum terbukti jalan | WP-00, WP-20 |

### 3.2 AI Engineer (Hafizh, Naufal)

Semua butir ❌ di Trello dan di repo. Kartu AI yang ada (Golden Set, LLM Cost Control, Address Parser, Grocery Parser, Substitution, Catalog Search) hanya desain, berbasis LLM atau aturan, dan Trello menyatakan fitur AI di luar scope demo 31 Okt.

| ID | Butir | Status | Paket |
|---|---|---|---|
| AE-M1 | README menjelaskan masalah yang diselesaikan model | ❌ | WP-03 |
| AE-M2 | Model AI disesuaikan dengan data dari tim DS | ❌ | WP-11, WP-12 |
| AE-M3 | Preprocessing sebelum dipakai model | ❌ | WP-11 |
| AE-M4 | Sumber API/dataset/library dicantumkan di README | ❌ | WP-03 (log sejak awal) |
| AE-M5 | Fitur generatif dengan API model proprietary | ❌ | WP-14, WP-15, WP-16 |
| AE-M6 | Bandingkan ≥2 model/konfigurasi, tabel + alasan di README | ❌ | WP-12 |
| AE-M7 | REST API FastAPI/Flask online, diakses backend | ❌ | WP-10, WP-13 |
| AE-P1 | Cek dan tangani ketidakseimbangan kelas | ❌ | WP-42 |
| AE-P2 | Peningkatan kinerja (augmentasi / tuning) + pengaruhnya | ❌ | WP-42 |
| AE-P3 | Uji pada data uji tersisih, metrik sesuai, hasil di README | ❌ | WP-42 |
| AE-P4 | Model tambahan (mis. sentimen) | ❌ | WP-52 (stretch) |
| AE-G1 | RAG: generation + embedding + vector DB | ❌ | WP-14 |
| AE-G2 | Klasifikasi intent ≥4 kelas, dipakai untuk routing | ❌ | WP-12, WP-14 |
| AE-G3 | Prompt terstruktur (template, few-shot) | ❌ | WP-14 |
| AE-G4 | Tolak pertanyaan di luar konteks, uji ≥10 pertanyaan | ❌ | WP-41 |
| AE-G5 | Bonus: SLM/LLM open-source lokal sebagai generation | ❌ | WP-53 (opsional) |
| AE-S1 | Kontrak API disepakati dengan FS sebelum coding | ❌ | WP-02 |
| AE-S2 | Tangani input tidak valid dan kegagalan/kuota AI | ❌ | WP-14, WP-43 |
| AE-S3 | Integrasi ke kanal UMKM (Telegram/WhatsApp) | ❌ | WP-40 |
| AE-S4 | Dokumentasi API yang bisa dicoba (Swagger/OpenAPI) | ❌ | WP-10, WP-43 |

### 3.3 Data Science (Ida, Dian)

Semua ❌ di repo. Di luar repo: analisis tarif kurir (xlsx) menyentuh DS-M1, DS-M4, DS-M5 secara parsial (temuan: 2M mulai rugi di sekitar 2,25 km).

| ID | Butir | Trello | Repo | Paket |
|---|---|---|---|---|
| DS-M1 | Identifikasi masalah UMKM + peran data | 🟡 | ❌ | WP-30 |
| DS-M2 | Rumuskan pertanyaan bisnis | ❌ | ❌ | WP-30 |
| DS-M3 | Seluruh tahap data wrangling | ❌ | ❌ | WP-31 |
| DS-M4 | Olah dan analisis, jelaskan proses + hasil | 🟡 | ❌ | WP-32 |
| DS-M5 | Sajikan temuan dan rekomendasi | 🟡 | ❌ | WP-32 |
| DS-M6 | Data/hasil bisa dipakai anggota tim lain + cara pakai | ❌ | ❌ | WP-31 |
| DS-M7 | Periksa ketepatan data dan hasil | ❌ | ❌ | WP-33 |
| DS-D1 | Dasbor interaktif (Streamlit atau lain) | ❌ | ❌ | WP-44 |
| DS-D2 | Indikator bisnis + filter relevan | ❌ | ❌ | WP-44 |
| DS-D3 | Pembaruan data lewat upload / koneksi | ❌ | ❌ | WP-44 |
| DS-D4 | Prioritaskan data primer, dummy/publik jika kurang | ❌ | ❌ | WP-31 |
| DS-D5 | Dasbor terintegrasi ke web app | ❌ | ❌ | WP-44 |
| DS-L1 | Sepakati kebutuhan/format data dengan tim Gen AI | ❌ | ❌ | WP-02 |
| DS-L2 | Pelabelan, transformasi, feature engineering | ❌ | ❌ | WP-11, WP-45 |
| DS-L3 | Kamus data | ❌ | ❌ (file 0 byte) | WP-31 |
| DS-L4 | Split train/test + cegah kebocoran | ❌ | ❌ | WP-11, WP-45 |
| DS-P1 | Model klasifikasi/regresi/forecasting sesuai fitur | ❌ | ❌ | WP-45 |
| DS-P2 | Feature engineering + pengaruhnya | ❌ | ❌ | WP-45 |
| DS-P3 | Uji pada data yang tidak dipakai training | ❌ | ❌ | WP-45 |
| DS-P4 | Bandingkan hasil >1 model + keterbatasan | ❌ | ❌ | WP-45 |
| DS-P5 | Integrasi prediksi ke web app | ❌ | ❌ | WP-45 |

### 3.4 Hitungan status (repo, bukan Trello)

Urutan kolom: ✅ / 🟡 / ❓ / ❌.

| LP | Main Quest | Side Quest | Total |
|---|---|---|---|
| FS | 4 / 1 / 0 / 1 (6) | 10 / 1 / 0 / 5 (16) | 14 / 2 / 0 / 6 (22) |
| AE | 0 / 0 / 0 / 7 (7) | 0 / 0 / 0 / 13 (13) | 0 / 0 / 0 / 20 (20) |
| DS | 0 / 0 / 0 / 7 (7) | 0 / 0 / 0 / 14 (14) | 0 / 0 / 0 / 21 (21) |
| **Semua** | | | **14 / 2 / 0 / 47 (63)** |

Hitung ulang dari tabel per butir (3.1–3.3) setiap kali status berubah.

## 4. Koreksi untuk briefing dan Trello

Briefing menyatakan "status diambil dari Trello, bukan dari repo". Hasil audit repo mengubah beberapa kesimpulan:

1. **Sisi pelanggan sudah ada.** Katalog dengan stok, keranjang, alamat dengan peta Leaflet dan validasi radius, checkout dengan rincian ongkir, bayar simulasi, status pesanan, tracking dengan peta, riwayat pesanan, dan chat. Briefing FS #1 dan kartu "Full-Stack — Deploy publik + alur pelanggan end-to-end…" perlu diperbarui.
2. **Endpoint sudah seragam `/api/v1`.** Keputusan FS #4 ("seragamkan ke /api/v1") sebenarnya sudah terjadi di kode.
3. **Validasi skema memakai zod, bukan Joi.** Checklist menulis "seperti Joi", jadi zod memenuhi syarat. Cukup didokumentasikan.
4. **Hosting.** Repo sudah punya `render.yaml` (free tier) dan workflow VPS yang dijadikan manual. Pertanyaannya bukan "pilih hosting" tetapi "apakah Render benar-benar jalan, dan apakah Redis dan S3 terpasang". Briefing FS keputusan #1 harus dibaca ulang dengan fakta ini.
5. **Metabase kemungkinan tidak muat di free tier.** Metabase self-host umumnya butuh RAM di atas 512 MB (batas Render free). Streamlit (disebut eksplisit di checklist DS) bisa di-host gratis dan di-embed lewat iframe. Usulan DS "Metabase di-embed" sebaiknya diganti kecuali ada hosting Metabase.
6. **Briefing AE benar** bahwa tidak ada service Python, tetapi kondisinya lebih kosong dari yang tersirat: bahkan `pyproject.toml`, `Dockerfile`, dan `run_eval.py` di `services/ml-api` berisi 0 byte.
7. **Pembagian kerja AE.** Hafizh tercatat sebagai Project Lead dan sebagai satu dari dua AE yang memegang 20 butir. Beban perlu dibagi eksplisit (keputusan D7).

## 5. Keputusan: rekomendasi dan status

Setiap keputusan berisi satu rekomendasi. Ubah kolom Status saat disepakati.

| ID | Keputusan | Rekomendasi | Alasan | Status |
|---|---|---|---|---|
| D1 | Fitur generatif Main Quest (AE-M5) | **Chatbot FAQ + RAG** lebih dulu. Grocery List Parser jadi stretch (WP-50). Address Parser tetap digerbang | Satu fitur menutup AE-M5, G1–G4, S3. Grocery Parser butuh Catalog Search dan SKU matching dulu | Terbuka |
| D2 | Model terlatih Main Quest (AE-M2) | **Klasifikasi intent teks** (≥5 kelas) sebagai model utama. **ETA pengiriman** (regresi) jadi pekerjaan DS di Side Quest yang disajikan lewat service yang sama | Intent tidak bergantung data transaksi yang belum ada, dan checklist sendiri menyarankan model Main Quest dijadikan klasifier intent. ETA dilatih dari data simulasi sehingga model hanya mempelajari rumus simulator; cocok sebagai pasangan DS, kurang kuat sebagai penopang Main Quest | Terbuka |
| D3 | Penyedia LLM dan batas biaya | Gemini kelas Flash (free tier) di balik antarmuka provider, cap bulanan kecil, nama model dicek saat implementasi | Gratis untuk capstone, mudah diganti | Terbuka |
| D4 | Embedding dan vector DB | Embedding lewat API + **FAISS (cpu)**, indeks dibangun ulang saat boot dari `services/ml-api/knowledge/` | Muat di 512 MB, tidak butuh disk persisten. Chroma boleh jika RAM cukup | Terbuka |
| D5 | Kanal chatbot | **Telegram** dulu, plus widget di customer-web. WhatsApp = stretch | WhatsApp butuh persetujuan template dan penerima terdaftar; Telegram gratis dan instan | Terbuka |
| D6 | Hosting | Render (API, ml-api, situs statis), Postgres hosted (Supabase, sudah dipakai di `.env` root), Redis hosted (mis. Upstash), penyimpanan objek S3-compatible. Dasbor DS: **Streamlit Community Cloud**. Cadangan ml-api: Hugging Face Spaces (Docker, RAM lebih besar) | Semua tersedia free tier. Cold start 30–60 dtk perlu ditulis di README | Terbuka |
| D7 | Pembagian kerja AE | Naufal: ml-api (WP-10–14, 41–43). Hafizh: gateway Node + UI + koordinasi + deploy (WP-00–03, 15, 16, 20, 40), plus peran lead. Tukar sesuai kapasitas | Memisahkan Python dan Node | Terbuka |
| D8 | Tenggat capstone | _isi: ____________ (tidak ada di dokumen mana pun yang saya baca)_ | Menentukan apakah Tahap 3 dikerjakan | Terbuka |
| D9 | Sumber data awal | Data **dummy berlabel** buatan tim sekarang; minta data asli 2M paralel. Setiap baris punya kolom `source` (`team_written` / `synthetic` / `real`) | DS tidak perlu menunggu izin; sesuai syarat checklist | Terbuka |

## 6. Paket kerja

Urutan: Tahap 0 → 1 → 2 → 3 → 4. Paket dalam satu tahap yang tidak saling bergantung bisa dikerjakan paralel. Estimasi hari kerja bersifat kasar, untuk satu orang.

### Tahap 0 — Verifikasi dan fondasi (±2 hari)

- [x] **WP-00 Verifikasi kondisi deploy (FS-M6, FS-C3)** — Owner: Hafizh/Zoel. **Selesai 2026-11-08**: API Render hidup dan `GET /health` menjawab `{"status":"ok"}` setelah redeploy pukul 04:22 UTC (dilaporkan pemilik; saya tidak mengujinya sendiri). Sebelum redeploy, instance tidak menjawab sama sekali; penyebabnya tidak pernah terlihat di log, jadi risiko "tidur / macet lalu tidak bangun" tetap ada untuk demo (lihat WP-20). Catatan lama di bawah dipertahankan sebagai riwayat. Sisa yang dipindah ke WP-20: URL tiga situs statis yang sebenarnya, tes dari ponsel, alur checkout dan upload bukti di URL publik, dan cara mencegah instance tertidur saat demo. Dugaan Redis/env yang sempat dicatat **tidak didukung log**: saat boot, worker memanggil `rebuildCounters` dan mencetak "stock counters rebuilt" dengan 30 counter, jadi Postgres dan Redis terjangkau pada deploy 7 Nov. Yang belum terbukti: checkout end-to-end di URL publik dan upload foto bukti (S3). Selesai bila: catatan "hidup / mati + penyebab" tertulis di bagian 9.
- [ ] **WP-01 Kunci keputusan D1–D9** — Owner: Hafizh (lead). Selesai bila kolom Status bagian 5 terisi dan hasilnya dikirim ke grup tim.
- [ ] **WP-02 Kontrak API v0.1 dan format dataset (AE-S1, FS-C2, DS-L1)** — Owner: Hafizh + Alga + Ida. Isi `contracts/ml-api.openapi.json` (draf endpoint di bagian 8), tambah entri di `contracts/CHANGELOG.md`, tulis spesifikasi dataset intent dan ETA di `data-science/data_dictionary.md`. Selesai bila tiga LP menyetujui (catat tanggal) dan tenggat serah-terima dataset terisi.
- [ ] **WP-03 README dan log sumber (AE-M1, AE-M4, FS-M1)** — Owner: Hafizh. Tulis ulang `README.md`: masalah dan pengguna, URL publik, cara menjalankan, struktur, bagian placeholder untuk model (masalah, data, perbandingan, contoh request/response). Buat `docs/SOURCES.md` untuk mencatat setiap dataset, API, dan library dengan lisensinya **sejak awal**.

### Tahap 1 — Main Quest (wajib)

**AE**

- [ ] **WP-10 Kerangka `services/ml-api` (AE-M7, AE-S4)** — Isi `pyproject.toml`, `Dockerfile` (konteks root, sama seperti API), `app/main.py` (FastAPI), `GET /health`, `GET /docs`, pengamanan header `X-Internal-Key` dari env, pembatas ukuran input, `tests/` dengan pytest, job `ml-api` di `.github/workflows/ci.yml`. Tambahkan service ke `render.yaml`. Selesai bila `/health` dan `/docs` terbuka di URL online.
- [ ] **WP-11 Dataset intent v1 dan preprocessing (AE-M2, AE-M3, DS-L2, DS-L4)** — Bersama DS. Berkas `data-science/datasets/intent_v1.csv` (jangan di `data-science/data/`, karena itu di-ignore git) dengan kolom `text,intent,source,split`. Kelas awal: `cek_pesanan`, `tanya_ongkir`, `tanya_produk`, `info_umum` (jam, area, pembayaran), `komplain`, `di_luar_konteks`. Minimal 40 baris per kelas (≥240), split 70/30 dengan test dibekukan, ada variasi slang dan typo. Skrip preprocessing di `services/ml-api/app/preprocess.py` (lowercase, normalisasi slang, tanpa PII) dan bisa dijalankan ulang. Selesai bila dataset, data dictionary, dan pengecekan kebocoran (tidak ada kalimat sama di train dan test) tercatat.
- [ ] **WP-12 Latih dan bandingkan model (AE-M2, AE-M6, AE-G2)** — `services/ml-api/app/train.py` melatih dan mengevaluasi minimal: (A) TF-IDF karakter + Logistic Regression, (B) TF-IDF kata + LinearSVC, (C opsional) embedding multilingual + Logistic Regression. Metrik sama: macro-F1, akurasi, presisi/recall per kelas, matriks konfusi, pada split yang sama. Simpan artefak ke `services/ml-api/models/` (di-ignore git; latih saat `docker build` atau commit artefak kecil dengan pengecualian `.gitignore` — putuskan di PR). Tabel perbandingan dan alasan memilih model ditulis di README. Selesai bila README memuat tabel dan model terpilih.
- [ ] **WP-13 Serving model (AE-M7)** — `POST /v1/intent` (draf di bagian 8), validasi pydantic, kode error konsisten, `model_version` di respons. Deploy online. Selesai bila backend Node berhasil memanggilnya dari URL online dan contoh request/response ada di README.
- [ ] **WP-14 Gateway LLM + RAG chat (AE-M5, AE-G1, AE-G3, AE-S2)** — `services/ml-api/app/services/{llm,rag,chat}.py`. Gateway: timeout 3–5 dtk, maksimal 1 retry, cache respons (hash input + versi prompt + model), batas panjang input, circuit breaker, pindah ke fallback saat gagal atau kuota habis. Fallback: jawaban ekstraktif (kutipan FAQ teratas) dengan `fallback_used=true`. Basis pengetahuan: `services/ml-api/knowledge/*.md` (FAQ, jam operasional, ongkir, kebijakan; katalog bisa ditarik lewat API Node). Prompt di `services/ml-api/prompts/` dengan nomor versi, template + few-shot. Jawaban wajib bersumber dari potongan yang diambil; skor retrieval di bawah ambang → tolak. **Jangan kirim nama, telepon, atau alamat ke LLM.** Selesai bila 20 pertanyaan uji dijawab dari sumber, kegagalan LLM menghasilkan fallback (bukan 500).
- [ ] **WP-15 Modul `ai-gateway` di Node (FS-I2, FS-I4)** — Isi `apps/api/src/modules/ai-gateway/` (ganti `README.md`): klien ke `ML_API_URL` dengan `ML_API_KEY`, timeout, retry hanya untuk galat jaringan/5xx, pemetaan error. Migrasi baru `db/migrations/1761000000012_ai.sql` dengan tabel `llm_usage` (lihat bagian 8). Route `POST /api/v1/assistant/ask` (wajib login) dan `GET /api/v1/assistant/history`. Kontrak zod di `packages/shared/src/contracts/assistant.ts`, diekspor lewat `contracts/index.ts`. Batas harian per pengguna dan batas global dihitung dari `llm_usage`. Tes integrasi di `apps/api/test/integration/assistant.test.ts` dengan ml-api palsu. Tambahkan `ML_API_URL`, `ML_API_KEY` ke `env.ts` dan `.env.example`.
- [ ] **WP-16 UI asisten di customer-web (AE-M5, FS-K2)** — `apps/customer-web/src/features/assistant/` (halaman atau panel dengan tombol mengambang), status mengetik/loading, pesan galat berbeda untuk: layanan mati, kuota habis, terlalu panjang, tidak ada jawaban. Saat AI tidak tersedia, tampilkan tautan ke chat admin yang sudah ada (`features/chat`). Selesai bila alur jalan di ponsel pada URL publik.

**FS**

- [ ] **WP-20 Deploy publik terverifikasi (FS-M6, FS-C3)** — **Diperkecil 2026-11-08**: pemilik melaporkan tiga situs statis sudah pernah didemokan dan jalan, jadi yang tersisa hanya mencatat URL dan langkah deploy di README, bukti tertulis (tangkapan layar / laporan) untuk WP-21, dan ping anti-tidur opsional agar demo tidak kena cold start. Teks asli paket ini di bawah. Lanjutan WP-00. Pasang Redis hosted dan penyimpanan objek, isi env di Render, jalankan migrasi dan seed demo (`db:reset:demo` **hanya** di database demo, bukan database yang menyimpan data lain), uji tiga situs dari ponsel. Pertimbangkan ping berkala agar tidak tertidur saat demo. Tulis URL dan langkah ulang di README. Selesai bila tiga URL terbuka di ponsel dan alur 10 langkah di `docs/runbook/demo.md` lolos pada URL publik.
- [ ] **WP-21 Bukti alur pelanggan end-to-end (FS-M3)** — Jalankan `pnpm local:*` lalu `pnpm demo:smoke` di stack Docker terisolasi (lihat `CLAUDE.md`), simpan keluarannya dan beberapa tangkapan layar di `docs/reports/`. Selesai bila ada laporan uji dengan tanggal.
- [ ] **WP-22 Audit tanda berhasil/gagal/proses (FS-M4)** — Buat tabel aksi utama (login, tambah ke keranjang, checkout, bayar, terima order, ambil job, kirim bukti, catat penarikan, kirim chat) × (loading, sukses, gagal) dan rapikan yang bolong dengan komponen yang sudah ada (`toast`, `States.tsx`, `feedback.tsx`). Selesai bila tabel penuh dan tersimpan di `docs/reports/`.
- [ ] **WP-23 Panduan pengguna (FS-M5)** — Halaman `/bantuan` di customer-web dan admin-web (cara pesan, bayar, lacak; cara terima, picking, kelola kurir, catat penarikan), tip singkat di courier-pwa, onboarding pertama kali yang bisa ditutup. Selesai bila terlihat dari navigasi utama.

**DS (dimiliki Ida dan Dian; struktur repo disediakan di sini)**

- [ ] **WP-30 Problem statement dan pertanyaan bisnis (DS-M1, DS-M2)** — `data-science/README.md`: 1 halaman masalah, 3–5 pertanyaan (mis. di jarak berapa ongkir menutup biaya kurir, jam/cabang mana pesanan menumpuk, SKU apa paling sering dipesan, durasi antar per zona).
- [ ] **WP-31 Dataset dan wrangling (DS-M3, DS-M6, DS-D4, DS-L3)** — Notebook/skrip di `data-science/notebooks/` dan `data-science/sql/` yang bisa diulang (gathering, assessing, cleaning), keluaran CSV bersih di `data-science/datasets/`, kamus data di `data-science/data_dictionary.md`, README cara pakai. Label sumber data di setiap baris.
- [ ] **WP-32 Analisis dan rekomendasi (DS-M4, DS-M5)** — Laporan 2–3 halaman atau visual di `docs/reports/`.
- [ ] **WP-33 Pengecekan ketepatan (DS-M7)** — Checklist QA: duplikat, nilai kosong, outlier, rekonsiliasi total; kaitkan dengan kartu Data Quality Guard.

### Tahap 2 — Side Quest

- [ ] **WP-40 Kanal Telegram (AE-S3)** — Webhook `POST /api/v1/webhooks/telegram` dengan token rahasia, dipasang sebelum `express.json()` seperti webhook Xendit bila butuh body mentah. Hanya intent publik (ongkir, produk, info umum); cek pesanan **hanya di aplikasi** karena butuh login (catat di README). Batas laju per `chat_id`. Selesai bila bot menjawab di Telegram dari URL publik.
- [ ] **WP-41 Uji penolakan di luar konteks (AE-G4)** — `services/ml-api/eval/golden_set/oos.jsonl` ≥10 pertanyaan, dijalankan oleh `eval/run_eval.py`; hasil dicatat di README. Selesai bila semua ditolak dengan sopan.
- [ ] **WP-42 Kualitas model (AE-P1, AE-P2, AE-P3)** — Laporkan distribusi kelas dan penanganannya (`class_weight`, augmentasi typo/slang), tuning (GridSearchCV) dengan metrik sebelum/sesudah, dan hasil di test beku. Selesai bila README memuat ketiganya.
- [ ] **WP-43 Penanganan kegagalan dan Swagger (AE-S2, AE-S4, FS-K2)** — Saklar uji `AI_CHAOS=timeout|quota|down` di ml-api (hanya non-production) untuk mendemokan fallback; tautan Swagger di README. Selesai bila ketiga mode menghasilkan pesan yang jelas, bukan layar kosong.
- [ ] **WP-44 Dasbor (DS-D1, D2, D3, D5, FS-I3)** — Streamlit di `data-science/dashboard/` (≥4 indikator; filter cabang, periode, SKU; unggah CSV untuk memperbarui data), di-embed lewat iframe di `apps/admin-web/src/features/metrics-embed/` (yang sekarang `.gitkeep`), dengan state galat jika dasbor tidak bisa dimuat.
- [ ] **WP-45 Model ETA (DS-P1–P5, DS-L2, DS-L4, FS-I3)** — DS melatih ≥2 model pada data simulasi/pilot berlabel; AE menyajikan lewat `POST /v1/predict/eta`; FS menampilkan di `apps/api/src/modules/orders/tracking.ts` (sekarang ETA = jarak ÷ `TRACKING_AVG_SPEED_KMH`) dan di admin. Fitur kandidat: jarak rute, berat, jumlah item, jam, hari, cluster motor. Catat bahwa data bersifat simulasi sebagai keterbatasan.
- [ ] **WP-46 Mockup, verifikasi stack, dokumen desain (FS-U1, FS-U2, FS-K1, FS-A\*)** — Mockup layar utama (Figma atau gambar) di `docs/design/` dengan alasan keputusan, tabel verifikasi stack (Vite, `/api/v1`, Axios, Tailwind, zod) di README, dan audit singkat bahwa setiap route punya skema zod.

### Tahap 3 — Stretch (hanya jika tenggat D8 memungkinkan)

- [ ] **WP-50 Grocery List Parser** — Aturan dulu (pemisah baris/koma, regex jumlah+satuan), LLM hanya untuk baris sulit, keluaran JSON tervalidasi, LLM tidak boleh mengeluarkan ID SKU; butuh WP-51.
- [ ] **WP-51 Catalog Search** — Postgres FTS (`simple`) + `pg_trgm` + tabel `search_synonyms`; tanpa biaya LLM.
- [ ] **WP-52 Ulasan + model sentimen (AE-P4)** — Tambah rating dan komentar pada order DELIVERED, latih klasifier positif/negatif, tampilkan di admin.
- [ ] **WP-53 SLM lokal (AE-G5)** — Provider `ollama` pada antarmuka LLM untuk pengembangan lokal; tidak dapat di-host di free tier sehingga hanya bernilai bila dapat diakses tim Web.
- [ ] **WP-54 Adaptor WhatsApp** — Memakai nomor uji WhatsApp Cloud API; gunakan abstraksi kanal dari WP-40.

### Tahap 4 — Penutup

- [ ] **WP-60 README final** — Masalah, URL publik, cara menjalankan, tabel perbandingan model, hasil held-out, hasil uji penolakan, contoh request/response, sumber dan lisensi, keterbatasan (data dummy, cold start).
- [ ] **WP-61 Sinkronisasi Trello** — Perbarui kartu "Checklist Tech Stack" sesuai bagian 3 (terutama koreksi bagian 4) dan sebut pay kurir order FAILED (bagian 2).
- [ ] **WP-62 Skrip demo dan pembekuan** — Perbarui `docs/runbook/demo.md` dengan langkah asisten dan ETA, uji ulang di URL publik dari ponsel, bekukan versi.

## 7. Aturan kerja di repo

Dipindahkan ke `CLAUDE.md` di root repo (8 Nov 2026) supaya terbaca otomatis di setiap sesi.

## 8. Draf kontrak (bahan WP-02)

Semua respons ml-api membawa `model_version`. Bentuk error disamakan dengan Node. Nama bidang bisa berubah selama WP-02; ubah juga `contracts/CHANGELOG.md`.

```
GET  /health                      -> { status: "ok", model_version, llm: "up|down" }
POST /v1/intent   { text }        -> { intent, confidence, alternatives: [{intent, confidence}], model_version }
POST /v1/chat     { message, history?: [{role, text}], context?: { branch_id? } }
                                  -> { answer, intent, sources: [{id, title}], fallback_used, usage: { model, prompt_version,
                                       input_tokens, output_tokens, latency_ms, cached } }
POST /v1/predict/eta { distance_km, weight_kg, item_count, hour, dow, motor_cluster? }
                                  -> { eta_minutes, model_version }
```

Node (publik, wajib login):

```
POST /api/v1/assistant/ask   { message, thread_id? } -> { answer, intent, sources, fallback_used }
GET  /api/v1/assistant/history ?limit&cursor          -> daftar interaksi pengguna
```

Tabel `llm_usage` (nama mengikuti kartu Trello): `id`, `user_id`, `branch_id`, `channel` (`app|telegram`), `feature`, `intent`, `input_text` (disamarkan), `output_text`, `model`, `prompt_version`, `input_tokens`, `output_tokens`, `latency_ms`, `cached`, `fallback_used`, `status` (`ok|error|budget`), `error_code`, `created_at`. Indeks pada `(user_id, created_at)` dan `(created_at)` untuk hitung batas harian/bulanan.

Spesifikasi dataset ETA (DS): `order_id, branch_id, distance_km, weight_kg, item_count, hour, dow, motor_cluster, prep_minutes, travel_minutes, total_minutes, source, split`. Target `total_minutes`. Sumber data nyata di repo: `order_state_transitions` (cap waktu per status), `courier_pings`, `orders.route_distance_km`; `apps/api/scripts/sim-courier-pings.ts` adalah satu-satunya penghasil gerak kurir buatan saat ini.

## 9. Log keputusan dan kemajuan

| Tanggal | Catatan |
|---|---|
| 2026-11-08 | Dokumen dibuat. Tes, build, dan aplikasi belum dijalankan. |
| 2026-11-08 | **Koreksi status deploy atas laporan pemilik.** Diam API pada probe awal dinilai cold start free tier (bukan kerusakan), dan situs statis sudah pernah didemokan dan jalan. FS-M6 dan FS-C3 diubah ❓ → ✅ (berdasarkan laporan, bukan pengujian saya); hitungan 3.4 menjadi 14 / 2 / 0 / 47. Fokus berpindah ke paket aplikasi (Tahap 1 dan 2). |
| 2026-11-08 | **WP-00 selesai.** Log Render menunjukkan deploy ulang 04:22 UTC (build memakai cache) dan "Your service is live" pukul 04:23:05 UTC, dengan `stock counters rebuilt` (30) lagi. Pemilik melaporkan `/health` kini menjawab `{"status":"ok"}`. Saya tidak mengulang probe sesudah redeploy. FS-M6 dan FS-C3 tetap ❓ sampai tiga situs statis dibuka dari ponsel dan satu pesanan lolos di URL publik (WP-20). Sisa risiko: sebelum redeploy, instance diam >170 dtk tanpa penyebab terlihat. |
| 2026-11-08 | **WP-00 koreksi setelah log deploy diterima.** Log Render 7 Nov 15:32–15:33 UTC: image terbangun dan terdorong, "Your service is live", `api listening` port 3000, worker/sweeper/reconciliation jalan di proses API, `stock counters rebuilt` (30). Artinya DB dan Redis terjangkau saat boot, jadi dugaan "Redis kosong → checkout gagal" di entri bawah **tidak berlaku untuk deploy itu**. Log yang ditempel berakhir di 15:33 UTC 7 Nov, sebelum semua probe saya, jadi belum menjelaskan kenapa `/health` tidak menjawab 12 jam kemudian. Probe ulang 04:15 UTC: tetap 0 byte setelah 120 dtk. Hipotesis berikutnya (belum terbukti): instance free tier sedang tidur dan gagal bangun, atau macet setelah dibangunkan. Nama pod di log mengandung "hibernate", konsisten dengan itu tetapi bukan bukti. |
| 2026-11-08 | **WP-00 (sebagian), pengecekan dari luar.** `GET https://twom-online-shopping.onrender.com/health`: koneksi TLS terbentuk, permintaan terkirim, **0 byte respons** setelah 20 dtk, 60 dtk, dan 170 dtk (tiga percobaan). Tebakan nama situs statis (`2m-customer-web`, `2m-admin-web`, `2m-courier-pwa` di `onrender.com`) langsung menjawab `404` dengan header `x-render-routing: no-server`, artinya nama itu tidak dipakai layanan mana pun (nama di `render.yaml` bukan jaminan subdomain-nya sama; URL asli harus dilihat di dashboard). **Kesimpulan yang masuk akal tetapi belum terbukti:** layanan API ada (domain tidak menjawab 404 seperti nama yang tidak ada) tetapi prosesnya tidak melayani permintaan, entah karena macet saat boot atau gagal start. Dari luar tidak bisa dibedakan dari cold start yang sangat lama; log Render dibutuhkan. Status FS-M6 dan FS-C3 tetap ❓. |

## 10. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Dataset DS terlambat atau tidak ada | WP-11, WP-12 tertahan (jalur kritis) | Mulai dari dataset intent yang ditulis tim sendiri (D9); DS memperbaiki dan memberi label |
| RAM 512 MB di Render free | ml-api crash (OOM) | Hindari torch; embedding lewat API; FAISS; cadangan Hugging Face Spaces |
| Cold start 30–60 dtk | Demo terlihat macet | Ping berkala, pesan "memuat" di UI, tulis di README |
| Kuota LLM habis saat demo | Chatbot gagal | Fallback ekstraktif, cache, batas harian, uji dengan `AI_CHAOS` |
| Model ETA hanya belajar rumus simulator | Klaim "model berguna" lemah | Nyatakan sebagai keterbatasan; jangan jadikan penopang Main Quest |
| Prompt injection lewat pesan pengguna | Jawaban menyimpang | Pesan pengguna diperlakukan sebagai data, dasar jawaban hanya potongan RAG, ambang penolakan |
| Beban tim AE (20 butir, 2 orang, 1 sebagai lead) | Tenggat terlewat | D7 dan batasi Tahap 3 |
| Database hosted terhapus oleh `db:reset` | Kehilangan data demo | Ikuti aturan di `CLAUDE.md` |
