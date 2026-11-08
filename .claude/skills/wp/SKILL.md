---
name: wp
description: Run one capstone work package (WP-xx) from docs/PROJECT_PLAN.md using the prompt templates in docs/PLAYBOOK.md. Use when the user types /wp <id> (for example /wp 12, /wp 14-design, /wp 14a, /wp baseline, /wp tutup-tahap) or says "kerjakan WP-xx".
---

# /wp — jalankan satu paket kerja

Argumen: `$ARGUMENTS` (ID paket kerja, mis. `12`, `14-design`, `14a`, `11b`, `baseline`, `tutup-tahap`, atau `eskalasi 12`).

Sumber kebenaran: `docs/PLAYBOOK.md` (alur, alokasi model, template prompt) dan `docs/PROJECT_PLAN.md` (isi WP). Jangan membaca plan seluruhnya.

## Langkah

1. **Tolak WP manual.** WP-01 (keputusan D1–D9) dan D8 (tenggat) dibuat oleh pengguna, bukan model. Katakan itu dan berhenti.
2. **Cari baris WP di tabel bagian 2 `docs/PLAYBOOK.md`** (model, effort, kolom "Baca bagian 8"). Jika model sesi ini bukan yang ditulis di tabel, sebut sekali di awal ("tabel menyarankan Opus High; ganti model dulu atau lanjut?") dan tunggu jawaban. Jangan mengganti model sendiri.
3. **Pilih template bagian 4 playbook:**
   - ID biasa → Prompt A.
   - Kolom bagian 8 bertanda ✔ → Prompt A + tambahan Prompt B.
   - `14-design` → Prompt C1 (tanpa kode). `14a` → Prompt C2.
   - `11a` → Prompt G. `11b` → Prompt H.
   - `baseline` → Prompt D. `tutup-tahap` → Prompt E. `eskalasi <id>` → Prompt F (tanyakan gejala dan dua percobaan sebelumnya bila belum diberikan).
   Baca template itu dari playbook dan jalankan persis, dengan `{xx}` diganti ID.
4. **Baca hanya blok `WP-{xx}`** di bagian 6 plan (`grep -n "WP-{xx}" docs/PROJECT_PLAN.md`). Bagian 8 hanya bila ✔. Untuk WP Python pakai `pytest` di `services/ml-api`.
5. **Gerbang.** Sebelum WP pertama setelah baseline: pastikan `DATABASE_URL` menunjuk DB lokal (bukan Supabase). Bila `.env` masih hosted, berhenti dan laporkan. Jangan pernah menjalankan `db:reset*` dengan `.env` hosted.
6. **Kerjakan** sesuai template: rencana ≤8 baris → implementasi → `pnpm typecheck && pnpm test && pnpm lint` → perbaiki atau laporkan jujur → commit conventional (tambahkan `docs/SOURCES.md` pada commit yang sama bila ada sumber baru).
7. **Penutup:** centang WP di bagian 6, ubah status butir terkait di bagian 3 (tanpa menghitung ulang 3.4), tambah 1 baris di bagian 9. Jangan ubah bagian lain.
8. **Review manual diwajibkan** untuk WP-02, WP-14, WP-15: ingatkan pengguna meninjau diff sebelum merge. Perubahan `contracts/` ditandai ke FS (Alga) dan DS (Ida).
9. Laporan akhir ≤10 baris: file berubah, hasil tes, yang belum terverifikasi.

Berhenti dan tanya hanya bila terblokir keputusan D1–D9 yang masih terbuka di bagian 5 plan.
