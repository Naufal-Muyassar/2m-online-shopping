# CLAUDE.md

Rencana kerja capstone (checklist Asah 2026, paket kerja WP-xx) ada di `docs/PROJECT_PLAN.md`; alur kerja, alokasi model, dan template prompt di `docs/PLAYBOOK.md`. Jalankan satu paket lewat `/wp <id>`. Jangan membaca plan seluruhnya; baca hanya blok WP yang disebut (dan bagian 8 bila perlu).

## Aturan kerja di repo

- Monorepo pnpm. Perintah: `pnpm typecheck`, `pnpm test`, `pnpm lint`. API di `apps/api`; kontrak zod bersama di `packages/shared/src/contracts` (JSON snake_case); frontend memanggil `/api/v1` lewat `packages/shared/src/api-client`.
- Error API memakai `AppError(status, code, message)` (`apps/api/src/shared/errors.ts`) dan frontend memetakan kode ke Bahasa Indonesia di `lib/api.ts` masing-masing app. Kode baru untuk AI: `AI_UNAVAILABLE`, `AI_TIMEOUT`, `AI_BUDGET_EXCEEDED`, `AI_INPUT_TOO_LONG` (sesuaikan dengan bentuk error yang ada saat WP-15).
- Migrasi: berkas `.sql` bernomor di `db/migrations` (berikutnya `1761000000016_*`), maju saja, tidak ada rollback.
- **UI: tidak ada aksi berupa teks bergaris bawah atau teks polos.** Setiap aksi (termasuk `<Link>` yang berfungsi sebagai aksi, misalnya "Ubah", "Kembali", "Daftar", "Hapus filter") wajib tombol sungguhan: `btn btn-secondary btn-sm` (atau `btn-danger-quiet btn-sm` untuk hapus, `.icon-btn` untuk ikon). Kelas `.link` dan `.btn-ghost` sudah dihapus dari preset; jangan dibuat lagi. Detail di `docs/DESIGN_SYSTEM.md` bagian 4.
- **Setiap kali menambah migrasi, tanpa diminta, sertakan di jawaban akhir satu blok SQL siap tempel untuk SQL Editor Supabase.** Isinya bagian `Up Migration` dari semua migrasi baru dalam satu `BEGIN; … COMMIT;`, dibuat idempoten (`ADD COLUMN IF NOT EXISTS`, `CREATE … IF NOT EXISTS`, constraint di dalam `DO $$ … IF NOT EXISTS (SELECT 1 FROM pg_constraint …)`), dan diakhiri `INSERT INTO pgmigrations (name, run_on)` untuk tiap migrasi dengan `WHERE NOT EXISTS`. Dengan begitu deploy Render (yang menjalankan `db.ts migrate`) tidak menjalankannya dua kali, dan SQL-nya tetap aman kalau Render lebih dulu. Uji blok itu dua kali di DB lokal sebelum diberikan.
- **Uji di stack lokal terisolasi sebelum deploy** (`pnpm local:up`, `local:reset`, `local:api`, `local:web`; proyek Docker `2m-local`). `.env` di root menunjuk ke database hosted (Supabase) dan `db:reset` menghapus seluruh skema, jadi jangan menjalankan `db:reset*` dengan `.env` itu. Test API membaca `.env`, jadi arahkan `DATABASE_URL` ke database lokal dulu.
- ml-api bersifat **internal**: hanya Node yang boleh memanggil (`X-Internal-Key`); frontend tidak boleh menyentuhnya langsung dan tidak boleh memegang kunci LLM.
- Jangan mengirim PII (nama, telepon, alamat, kode pesanan pelanggan lain) ke LLM atau menyimpannya di `llm_usage` tanpa disamarkan.
- Commit memakai gaya conventional commits (`feat(scope): …`), seperti riwayat repo. `.gitignore` sudah mengabaikan `data-science/data/`, `services/ml-api/models/*`, `.venv/`, `__pycache__/`.
- Setiap sumber data, dataset, API, dan library baru dicatat di `docs/SOURCES.md` pada commit yang sama.
- ml-api: tanpa torch/transformers (embedding lewat API, FAISS cpu), target RAM di bawah 512 MB (Render free). Dataset di `data-science/datasets/`, bukan `data-science/data/`.

## Keputusan (isi satu baris per ID setelah WP-01)

- D1 fitur generatif: Chatbot FAQ + RAG; Grocery List Parser stretch (WP-50); Address Parser digerbang (2026-11-24)
- D2 model utama: klasifikasi intent teks (≥5 kelas); ETA regresi = DS Side Quest, disajikan lewat ml-api (2026-11-24)
- D3 LLM: di balik antarmuka provider, dipilih lewat env. **Pengembangan: LLM lokal** (GPU RTX 5060 Ti 16 GB, runtime HTTP mis. Ollama). **Deploy: migrasi ke Gemini Flash**, cap biaya Rp0 (free tier) + batas harian di `llm_usage` (2026-11-24)
- D4 embedding / vector DB: FAISS cpu, indeks dibangun ulang saat boot dari `services/ml-api/knowledge/`; embedding lokal saat pengembangan, Gemini saat deploy (dimensi beda, indeks tidak dipakai lintas provider) (2026-11-24)
- D5 kanal: Telegram + widget customer-web; WhatsApp stretch (2026-11-24)
- D6 hosting: Render (API, ml-api, statis) + Supabase + Upstash Redis + S3-compatible; Streamlit Community Cloud untuk dasbor DS; cadangan ml-api HF Spaces (2026-11-24)
- D7 pembagian AE: Hafizh memegang hampir seluruh paket AE (WP-01–03, 10–16, 20, 40–43, 60, 62) + lead; bagian bersama Naufal menyusul. Urutan kerja: `docs/PROJECT_PLAN.md` bagian 6.0 (2026-11-23)
- D8 tenggat: MA 4 Asah berakhir 22 Des 2026 23.59 WIB (MA 3 s.d. 24 Nov); dipakai sebagai tenggat kerja sampai tanggal pengumpulan resmi diketahui; Tahap 3 hanya bila Tahap 1–2 selesai sebelum 15 Des (2026-11-24)
- D9 sumber data awal: dummy berlabel buatan tim, data asli 2M diminta paralel; kolom `source` (`team_written`/`synthetic`/`real`) (2026-11-24)
