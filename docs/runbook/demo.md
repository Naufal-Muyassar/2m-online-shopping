# Runbook demo (31 Okt)

## Start (urutan)
1. `docker compose -f infra/docker/compose.dev.yml up -d` (Postgres, Redis, MinIO + bucket `proofs`).
2. `copy .env.example .env` (sekali). `PAYMENT_PROVIDER=mock`, worker berjalan di dalam proses API.
3. `pnpm install`, lalu `pnpm db:reset:demo` (data tanpa order; mencetak akun dan URL).
4. `pnpm dev:all` (API + 3 frontend; port tetap, gagal jika port terpakai). `start.bat` melakukan 1-4 di Windows.
5. `pnpm demo:smoke` harus mencetak semua langkah PASS sebelum demo.

## URL
API http://localhost:3000 · Customer http://localhost:5171 · Kurir (PWA) http://localhost:5172 · Admin http://localhost:5173 · MinIO http://localhost:9001

## Akun (password semua: `demo1234`)
| Peran | Telepon |
|---|---|
| super_admin | 081200000001 |
| branch_admin | 081200000002 |
| kurir | 081200000011 / 12 / 13 |
| customer | 081200000021 / 22 |

## Skrip demo (10 langkah)
1. Customer login, buka katalog: tunjukkan "Stok: 3" (Galon, Tray telur, Susu UHT) dan "Habis" (Tisu).
2. Tambah barang ke keranjang (min. belanja Rp30.000), lanjut ke alamat.
3. Pilih alamat tersimpan (atau pin baru di peta), buka checkout: ongkir (±km) dan rincian muncul.
4. Ganti metode bayar (QRIS/VA/e-wallet): harga dihitung ulang. Tekan "Bayar".
5. Halaman simulasi: "Bayar (simulasi)" → status "Pembayaran diterima".
6. Admin login: order di kolom "Perlu diterima", tekan "Terima" → "Menunggu kurir".
7. Kurir login (PWA), status siap: order muncul di "Job tersedia" dalam ±10 dtk. "Ambil order".
8. Kurir centang semua barang, tekan "Jalan" (GPS dikirim). Customer melihat "Dalam perjalanan" dan nama depan kurir.
9. Kurir "Sudah sampai": foto bukti, kirim → "Selesai". Kurir kembali ke daftar job.
10. Customer melihat "Selesai"; admin melihat order di daftar "Selesai". Opsional: "Kedaluwarsakan" pada order baru → "Dibatalkan".

## Mengatur lokasi cabang demo
- Seed membaca `DEMO_BRANCH_NAME`, `DEMO_BRANCH_LAT`, `DEMO_BRANCH_LNG`, `DEMO_BRANCH_RADIUS_M` dari `.env` (lihat `.env.example`); jalankan `pnpm db:reset:demo` setelah mengubahnya.
- Tanpa reset (order tidak dihapus): `pnpm demo:set-branch -- --lat <n> --lng <n> [--name "<teks>"] [--radius <meter 500-10000>] [--branch <id>]`.
- Perintah ini memindahkan cabang, alamat customer demo (±0,8 km arah 45° dan ±1,6 km arah 200°), dan posisi kurir; mencetak tautan Google Maps untuk verifikasi.
- Contoh: `pnpm demo:set-branch -- --lat -6.9175 --lng 107.6191 --name "Cabang Bandung" --radius 5000`
- Ditolak jika `NODE_ENV=production` kecuali `--force`.
- Chip "Dekat/Sedang/Jauh" di halaman alamat aktif jika `VITE_DEMO_MODE=true`; chip di luar radius dinonaktifkan.

## Reset
`pnpm db:reset:demo` (menghapus semua data lalu seed ulang; ditolak jika `NODE_ENV=production`).

## Fallback
Jika alur customer bermasalah: `pnpm db:reset:demo -- --with-orders` membuat 3 order PAID, langsung mulai dari langkah 6.
