# Stok, checkout dan pembayaran: invarian dan kontrol

Dokumen acuan untuk skill `race-conditions`, `idempotency` dan `api-idempotency-keys`. Setiap kontrol di bawah
menyebut invarian yang dijaga, record yang diperebutkan, dan test yang membuktikannya (`apps/api/test/race/`).

## Invarian

1. **Tidak pernah oversell.** Untuk setiap (cabang, produk): `snapshot − buffer − Σ reservasi ACTIVE+COMMITTED ≥ 0`.
2. **Satu tekan "Bayar" = paling banyak satu pesanan**, berapa kali pun request itu dikirim ulang.
3. **Pesanan yang dibayar selalu masih memegang stoknya.** Reservasi tidak pernah dilepas selama hasil pembayaran belum pasti.
4. **Angka stok di halaman produk adalah petunjuk**, bukan janji. Jaminan ada di reservasi saat checkout.

## Alur checkout (`POST /api/v1/orders`)

```text
Klien: Idempotency-Key (UUID v4) dibuat sekali per niat, dipakai ulang di setiap retry
  │
Tx1 (satu transaksi Postgres)
  1. INSERT checkout_requests … ON CONFLICT DO NOTHING      ← klaim atomik (PK customer_id + key)
     · konflik → baca klaim; hash beda → 422 IDEMPOTENCY_KEY_REUSED; sama → replay
     · salinan paralel menunggu di PK sampai pemilik COMMIT/ROLLBACK (tanpa SELECT-lalu-INSERT)
  2. quote + kunci keranjang (FOR UPDATE)
  3. INSERT orders (id = order_id klaim; FK klaim DEFERRABLE) + order_items
  4. Redis Lua: cek-dan-kurangi semua SKU sekaligus (gerbang cepat, menyerap lonjakan)
  5. INSERT stock_reservations ACTIVE
  6. Kunci baris stock_snapshots (urut product_id) → hitung ulang sellable di Postgres
     · < 0 → 409 OUT_OF_STOCK, Redis dikembalikan, counter di-refresh dari Postgres
  7. kosongkan keranjang → COMMIT
  │
Tx2: buat invoice di provider (di luar transaksi), CREATED → PENDING_PAYMENT
```

- Redis adalah **admission control**: 1000 pembeli untuk 5 unit → 995 ditolak di Redis tanpa menyentuh kunci baris
  Postgres. Postgres adalah **otoritas**: yang lolos Redis (≤ jumlah stok) diserialisasi per produk oleh kunci baris
  snapshot, jadi counter Redis yang melenceng ke atas (eviction, restart, restore saat flush) tidak bisa menjual lebih.
- Klaim, pesanan dan reservasi commit atau rollback bersama. Checkout yang ditolak (stok habis, keranjang kosong) tidak
  meninggalkan klaim, jadi retry dengan key yang sama dievaluasi ulang.
- Replay: pesanan sudah PENDING_PAYMENT atau lebih → jawaban asli (200, header `Idempotent-Replayed: true`).
  Masih CREATED (Tx2 berjalan, atau prosesnya mati di antara Tx1 dan Tx2) → 409 `CHECKOUT_IN_PROGRESS` dengan
  `order_id`; replay tidak pernah memulai pembayaran kedua, rekonsiliasi yang menyelesaikannya.
  Pembayaran gagal dimulai → 502 `PAYMENT_INIT_FAILED` yang sama setiap kali (keranjang sudah dikembalikan).
- Klien (customer-web) me-retry otomatis hanya untuk tanpa respons, 503, atau `CHECKOUT_IN_PROGRESS`, selalu dengan
  key yang sama. Jawaban final mengakhiri key; request berbeda (alamat/metode) memakai key baru.
- Retensi key 24 jam (`expires_at`), dihapus oleh loop sweeper. Setelah kedaluwarsa, key yang sama dianggap checkout
  baru; keranjang yang sudah kosong membuatnya `CART_EMPTY`.

## Siklus reservasi

```text
ACTIVE ──PAYMENT_SUCCESS (outbox)──────────▶ COMMITTED ──CANCELLED──▶ RELEASED
ACTIVE ──PAYMENT_EXPIRED / CANCELLED / FAILED──▶ RELEASED
```

- Rilis/commit idempoten: hanya baris yang benar-benar berpindah status yang dikembalikan ke Redis.
- **Sweeper tidak melepas reservasi pesanan CREATED/PENDING_PAYMENT**, walau `expires_at` lewat. Hasil pembayaran
  (webhook atau rekonsiliasi ke provider) yang memutuskan. Kegagalan rekonsiliasi berarti stok tertahan lebih lama,
  bukan pesanan dibayar tanpa stok. Sweeper hanya: melepas milik pesanan CANCELLED/FAILED yang handler-nya hilang,
  dan meng-commit milik pesanan yang sudah dibayar tapi belum di-commit.
- Webhook: event disimpan dulu, status diambil ulang dari provider, `settleInTx` mengunci baris pesanan dan memeriksa
  status, jadi webhook ganda/terlambat dan rekonsiliasi aman dijalankan berulang.

## Refund (`apps/api/src/modules/refunds`)

```text
NEEDS_DESTINATION ──customer isi rekening/e-wallet──▶ READY ──admin transfer + unggah struk + no. ref──▶ COMPLETED
```

- **Dibuka otomatis di transaksi penyebabnya** (kunci `dedupe_key`, unik per pesanan):
  pesanan yang sudah dibayar dibatalkan (`auto:cancelled`, penuh), barang kurang saat picking
  (`auto:shortage`, Σ (qty − picked_qty) × harga), pembayaran masuk ke pesanan yang sudah batal
  (`auto:late:<invoice>`). Replay event menemukan refund yang sama. Refund manual admin memakai
  `manual:<idempotency_key>` dari dialog (sama key + isi beda → 422).
- **Σ refund per pesanan ≤ grand_total**: setiap insert membaca jumlah di bawah kunci baris `orders`.
- **Selesai hanya dari READY** dalam satu `UPDATE … WHERE status = 'READY'`; mengulang dengan struk yang sama
  mengembalikan refund yang sudah selesai, struk lain → 409. Struk wajib ada di storage (`refunds/<id>/<uuid>.jpg`).
  Constraint DB: COMPLETED ⇔ ada struk, no. ref, dan waktu selesai; READY/COMPLETED ⇒ ada rekening.
- Customer melihat nomor rekening tersamar (4 digit terakhir), no. ref, waktu, dan foto struk (URL bertanda tangan
  5 menit). Admin melihat nomor lengkap. Customer bisa mengubah rekening sampai refund selesai.
- Belum: refund lewat API gateway (Xendit), notifikasi push/WA, pembatalan refund yang salah dibuat.

## Stok live (`GET /api/v1/branches/:id/stock/stream?product_ids=…`, SSE, publik)

- Setiap penulisan counter mem-publish key yang berubah ke channel Redis `stock:changed`; semua instance API mendengar.
- Hub per instance (`inventory/live.ts`) menggabungkan lonjakan (satu push per 250 ms per produk), membaca nilai
  sendiri (Redis, fallback Postgres), dan hanya mengirim produk yang berubah. Resync tiap 15 detik menutup pesan yang
  hilang. Heartbeat 20 detik. Maksimal 2000 stream per instance (503 `LIVE_STOCK_BUSY`). Tidak memegang koneksi DB.
- Klien menutup stream saat tab tersembunyi, membuka lagi (dengan snapshot) saat kembali, dan jatuh ke polling
  20 detik bila stream gagal ("Diperbarui berkala").

## Batas yang diketahui

- Proxy statis (Render/Netlify) bisa memutus SSE setelah beberapa puluh detik; EventSource tersambung ulang otomatis
  dan menerima snapshot baru. Belum diuji di Render.
- Rate limit per IP untuk checkout belum ada; key + kunci keranjang mencegah duplikat dari satu pelanggan.

## Test

`apps/api/test/race/stock-reservation.test.ts` dan `checkout-idempotency.test.ts`: 50 checkout paralel untuk 1 unit,
20 salinan paralel satu key, key dipakai ulang dengan body lain, counter Redis sengaja dinaikkan (Postgres tetap
menolak), pembayaran terlambat setelah reservasi lewat waktu, pesanan dibayar yang belum di-commit.
Jalankan terhadap stack lokal (lihat CLAUDE.md), jangan terhadap `.env` root.
