# Data dictionary

Spesifikasi dataset yang dipakai bersama AE dan DS (WP-02, draf v0.1, 2026-11-08). Kontrak service ada di `contracts/ml-api.openapi.json`; nama kelas dan kolom di sini harus sama dengan kontrak itu. Perubahan dicatat di `contracts/CHANGELOG.md`.

Semua dataset disimpan di `data-science/datasets/` (bukan `data-science/data/`, yang di-ignore git), dalam CSV UTF-8 dengan header, pemisah koma, dan kutip ganda bila teks mengandung koma.

## Aturan umum

- **Kolom `source`** wajib di setiap baris: `team_written` (ditulis anggota tim), `synthetic` (dihasilkan skrip atau LLM, termasuk simulator), atau `real` (data asli 2M). Mengikuti rekomendasi D9 yang masih Terbuka.
- **Tanpa PII.** Tidak ada nama orang, nomor telepon, alamat lengkap, email, atau kode pesanan asli. Bila kalimat butuh contoh, pakai placeholder: `<NAMA>`, `<TELEPON>`, `<ALAMAT>`, `<KODE_PESANAN>`. Data `real` disamarkan sebelum masuk repo.
- **Kolom `split`**: `train` atau `test`. Test dibekukan; hash berkasnya dicatat saat dibekukan (WP-11b) dan tidak boleh diubah sesudahnya.

## 1. Dataset intent

Berkas: `intent_v0_raw.csv` (mentah, WP-11a) lalu `intent_v1.csv` (bersih dan ter-split, WP-11b). Dipakai untuk melatih model `POST /v1/intent`.

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `text` | string, 1–500 karakter | ya | Satu pesan pelanggan, Bahasa Indonesia sehari-hari. Boleh slang, singkatan, dan typo. Batas 500 sama dengan kontrak |
| `intent` | enum | ya | Salah satu dari enam kelas di bawah |
| `group_id` | string | ya | Id kelompok parafrase. Kalimat yang merupakan variasi dari ide yang sama memakai `group_id` yang sama, supaya split dilakukan per grup dan tidak bocor |
| `source` | enum | ya | `team_written`, `synthetic`, `real` |
| `split` | enum | ya di v1 | `train`, `test`. Kosong di `intent_v0_raw.csv` |

`group_id` adalah tambahan dari daftar kolom di WP-11 (`text,intent,source,split`). Kolom ini dibutuhkan WP-11b untuk split anti-kebocoran.

### Kelas

| Kelas | Arti | Contoh |
|---|---|---|
| `cek_pesanan` | Status, posisi, atau waktu tiba pesanan sendiri | "pesanan saya udah sampe mana", "kurirnya kok belum dateng" |
| `tanya_ongkir` | Biaya kirim, cara hitung, minimum belanja | "ongkir ke sini berapa ya", "kok ongkirnya mahal" |
| `tanya_produk` | Ketersediaan, harga, atau varian barang | "beras 5kg ada?", "minyak goreng merk apa aja" |
| `info_umum` | Jam buka, area layanan, metode pembayaran, cara pesan | "buka jam berapa", "bisa bayar cod?" |
| `komplain` | Keluhan: barang rusak atau kurang, salah kirim, kurir | "telurnya pecah 3", "barang saya kurang satu" |
| `di_luar_konteks` | Tidak berhubungan dengan belanja di 2M | "cuaca besok gimana", "buatin puisi dong" |

Bila satu kalimat mengandung dua maksud, label diberikan untuk maksud yang harus ditangani lebih dulu. Contoh: komplain sambil menanyakan status diberi label `komplain`.

### Target ukuran

Minimal 40 baris per kelas (≥240 baris) setelah dedupe. Split 70/30 per kelas berdasarkan `group_id`. Bila ada kelas di bawah 40 baris, laporkan, jangan ditambal diam-diam.

## 2. Dataset ETA

Berkas: `eta_v1.csv`. Dipakai untuk melatih model `POST /v1/predict/eta`. Target: `total_minutes`.

| Kolom | Tipe | Keterangan dan asal di database |
|---|---|---|
| `order_id` | uuid | `orders.id`. Hanya untuk penelusuran, bukan fitur. Bukan `orders.code` |
| `branch_id` | uuid | `orders.branch_id`. Dipakai untuk split dan analisis, bukan fitur di kontrak v0.1 |
| `distance_km` | number > 0 | `orders.route_distance_km` |
| `weight_kg` | number ≥ 0 | Total `order_items.weight_kg × qty` (`weight_kg` adalah berat per unit, sama dengan hitungan ongkir) |
| `item_count` | integer ≥ 1 | Jumlah baris pesanan (produk berbeda), bukan jumlah unit |
| `hour` | integer 0–23 | Jam saat status menjadi PAID, waktu Asia/Jakarta |
| `dow` | integer 0–6 | Hari saat status menjadi PAID, waktu Asia/Jakarta; 0 = Senin |
| `motor_cluster` | `A`, `B`, kosong | `couriers.motor_cluster` milik kurir yang mengantar |
| `prep_minutes` | number | Menit dari PAID sampai READY (`order_state_transitions`) |
| `travel_minutes` | number | Menit dari ON_DELIVERY sampai DELIVERED |
| `total_minutes` | number | **Target.** Menit dari PAID sampai DELIVERED. Lebih besar dari `prep_minutes + travel_minutes` karena termasuk waktu menunggu kurir (READY sampai ON_DELIVERY) |
| `source` | enum | `synthetic` untuk pesanan dari simulator, `real` untuk pesanan asli |
| `split` | enum | `train`, `test`. Split per `branch_id` atau per rentang tanggal, bukan acak per baris |

Hanya pesanan yang berakhir DELIVERED yang masuk. Pesanan FAILED dan CANCELLED dibuang. Kueri ekstraksi disimpan di `data-science/sql/`.

**Keterbatasan:** gerak kurir saat ini hanya berasal dari `apps/api/scripts/sim-courier-pings.ts`. Model yang dilatih dari data `synthetic` hanya mempelajari rumus simulator. Ini dinyatakan di README dan laporan, dan ETA tidak dijadikan penopang Main Quest.

## 3. Serah-terima

| Dataset | Pemilik | Tenggat serah-terima |
|---|---|---|
| `intent_v0_raw.csv` | AE (Hafizh, Naufal) | _isi tanggal_ |
| `intent_v1.csv` (dibersihkan dan diberi label ulang oleh DS) | DS (Ida) | _isi tanggal_ |
| `eta_v1.csv` | DS (Ida) | _isi tanggal_ |

Tenggat bergantung pada D8 (tenggat capstone), yang belum diisi. Tanggal ditentukan tim, bukan oleh draf ini.

## Persetujuan

| Peran | Nama | Tanggal |
|---|---|---|
| AE | Hafizh | |
| FS | Alga | |
| DS | Ida | |
