# CLAUDE.md

Rencana kerja capstone (checklist Asah 2026, paket kerja WP-xx) ada di `docs/PROJECT_PLAN.md`; alur kerja, alokasi model, dan template prompt di `docs/PLAYBOOK.md`. Jalankan satu paket lewat `/wp <id>`. Jangan membaca plan seluruhnya; baca hanya blok WP yang disebut (dan bagian 8 bila perlu).

## Aturan kerja di repo

- Monorepo pnpm. Perintah: `pnpm typecheck`, `pnpm test`, `pnpm lint`. API di `apps/api`; kontrak zod bersama di `packages/shared/src/contracts` (JSON snake_case); frontend memanggil `/api/v1` lewat `packages/shared/src/api-client`.
- Error API memakai `AppError(status, code, message)` (`apps/api/src/shared/errors.ts`) dan frontend memetakan kode ke Bahasa Indonesia di `lib/api.ts` masing-masing app. Kode baru untuk AI: `AI_UNAVAILABLE`, `AI_TIMEOUT`, `AI_BUDGET_EXCEEDED`, `AI_INPUT_TOO_LONG` (sesuaikan dengan bentuk error yang ada saat WP-15).
- Migrasi: berkas `.sql` bernomor di `db/migrations` (berikutnya `1761000000012_*`), maju saja, tidak ada rollback.
- **Uji di stack lokal terisolasi sebelum deploy** (`pnpm local:up`, `local:reset`, `local:api`, `local:web`; proyek Docker `2m-local`). `.env` di root menunjuk ke database hosted (Supabase) dan `db:reset` menghapus seluruh skema, jadi jangan menjalankan `db:reset*` dengan `.env` itu. Test API membaca `.env`, jadi arahkan `DATABASE_URL` ke database lokal dulu.
- ml-api bersifat **internal**: hanya Node yang boleh memanggil (`X-Internal-Key`); frontend tidak boleh menyentuhnya langsung dan tidak boleh memegang kunci LLM.
- Jangan mengirim PII (nama, telepon, alamat, kode pesanan pelanggan lain) ke LLM atau menyimpannya di `llm_usage` tanpa disamarkan.
- Commit memakai gaya conventional commits (`feat(scope): …`), seperti riwayat repo. `.gitignore` sudah mengabaikan `data-science/data/`, `services/ml-api/models/*`, `.venv/`, `__pycache__/`.
- Setiap sumber data, dataset, API, dan library baru dicatat di `docs/SOURCES.md` pada commit yang sama.
- ml-api: tanpa torch/transformers (embedding lewat API, FAISS cpu), target RAM di bawah 512 MB (Render free). Dataset di `data-science/datasets/`, bukan `data-science/data/`.

## Keputusan (isi satu baris per ID setelah WP-01)

- D1 fitur generatif:
- D2 model utama:
- D3 LLM:
- D4 embedding / vector DB:
- D5 kanal:
- D6 hosting:
- D7 pembagian AE:
- D8 tenggat:
- D9 sumber data awal:
