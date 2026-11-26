# Data dictionary

Spesifikasi dataset yang dipakai bersama AE dan DS (WP-02, v0.2, disetujui 2026-11-26). Kontrak service ada di `contracts/ml-api.openapi.json` (v0.2.0); nama kelas di sini harus sama dengan kontrak itu. Perubahan dicatat di `contracts/CHANGELOG.md`.

Versi ini menggabungkan kamus DS (`kamus_data.csv` untuk data mentah order kurir, `kamus_data_model.csv` untuk dataset siap model) dengan spesifikasi AE dari v0.1. Kamus DS tetap menjadi rincian lengkap kolom ETA; berkas ini mencatat bagian yang menjadi kontrak dengan ml-api.

Semua dataset disimpan di `data-science/datasets/` (bukan `data-science/data/`, yang di-ignore git), dalam CSV UTF-8 dengan header, pemisah koma, dan kutip ganda bila teks mengandung koma.

## Aturan umum

- **Nama kolom.** File dataset memakai nama kolom Bahasa Indonesia mengikuti DS. Request dan response ml-api memakai nama Inggris. Pemetaannya ada di tabel tiap dataset.
- **Kolom `sumber_data`** wajib di setiap baris (D9: `team_written` / `synthetic` / `real`). File DS memakai kode sendiri yang dipetakan ke D9: `SINTETIS_DS_2M`, `SINTETIS_AI_2M`, dan `SINTETIS_SIMULASI` = `synthetic`; data asli kelak = `real`. Laporan dan README memakai istilah D9.
- **Tanpa PII.** Tidak ada nama orang, nomor telepon, alamat lengkap, email, atau kode pesanan asli. Bila kalimat butuh contoh, pakai placeholder: `<NAMA>`, `<TELEPON>`, `<ALAMAT>`, `<KODE_PESANAN>`. Data `real` disamarkan sebelum masuk repo.
- **Kolom `split`**: `train` atau `test_beku`, 70/30. Test dibekukan; hash berkasnya dicatat saat dibekukan dan tidak boleh diubah sesudahnya.

## 1. Dataset intent

Berkas: `intent_v0_raw.csv` (mentah AE, 240 baris, tanpa split, di Drive), `dataset_intent_clean_pp4.csv` (gabungan DS + AE, 508 baris, 2026-11-25), lalu **`intent_v1.csv`** (493 baris) yang dipakai untuk melatih model `POST /v1/intent`. Nama kolom mengikuti file gabungan DS.

`intent_v1.csv` dibangun oleh `data-science/scripts/build_intent_v1.py` dari file gabungan. **Split file gabungan adalah split resmi** (keputusan 2026-11-26; split di xlsx DS tidak dipakai). Skrip membuang 15 baris train yang duplikat atau parafrase baris `test_beku` (daftar dan pasangannya ada di skrip), merapikan spasi, lalu memeriksa kelas, panjang teks, `group_id`, duplikat lintas split, dan minimal 40 baris per kelas. Baris `test_beku` (154) tidak berubah; hash-nya `0e4d5ad732fa73945d00db4bf5f4e5dc393d98eee9667d1d49c1e00ff52e22dd` (SHA-256 baris `intent_id	text	intent` terurut). Distribusi: train 54–58 per kelas, test 25–26 per kelas.

`dataset_intent_clean_pp4.csv` di repo disusun ulang dari ekspor teks Drive, bukan salinan byte asli; isi barisnya sama (508 baris), spasi di ujung sel bisa berbeda.

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `intent_id` | string | ya | Id unik baris, `INT-001` dst. Nomor boleh bolong (baris duplikat dibuang) |
| `group_id` | string | ya | Id kelompok parafrase. Kalimat yang merupakan variasi dari ide yang sama memakai `group_id` yang sama. Baris DS sekarang satu grup per kalimat (`grp_int_NNN`) |
| `text` | string, 1–500 karakter | ya | Satu pesan pelanggan, Bahasa Indonesia sehari-hari. Boleh slang, singkatan, typo, dan placeholder PII. Sama dengan `text` di kontrak |
| `intent` | enum | ya | Salah satu dari enam kelas di bawah. Sama dengan `intent` di kontrak |
| `sumber_data` | enum | ya | `SINTETIS_DS_2M` (dibuat tim DS), `SINTETIS_AI_2M` (dibuat tim AE), kelak `ASLI_2M`. Dua yang pertama setara `synthetic` di D9 |
| `split` | enum | ya | `train` atau `test_beku` |
| `catatan_validasi` | string | tidak | Catatan audit DS, termasuk asal pemetaan label |

Label versi awal DS dipetakan ke nama kontrak: `cek_ongkir` → `tanya_ongkir`, `keluhan` → `komplain`, `out_of_context` → `di_luar_konteks`. Pemetaan tercatat di `catatan_validasi`.

**Aturan split (gabungan DS dan AE):** 70/30 per kelas, dilakukan per `group_id` sehingga satu grup parafrase tidak pernah ada di dua split. Di atas itu tetap berlaku aturan DS: tidak ada kalimat yang sama (setelah huruf kecil, buang tanda baca, normalisasi spasi) di train dan test. Kalimat dari sumber berbeda yang merupakan parafrase satu sama lain harus diberi `group_id` yang sama. Setelah dibekukan, baris `test_beku` tidak diubah; perbaikan kebocoran dilakukan dengan mengubah atau membuang baris train.

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

Minimal 40 baris per kelas (≥240 baris) setelah dedupe. Bila ada kelas di bawah 40 baris, laporkan, jangan ditambal diam-diam.

## 2. Dataset ETA

Berkas: `dataset_model_order.csv` (DS). Dipakai untuk melatih model `POST /v1/predict/eta`. Target: `target_eta_menit`. Rincian semua kolom, termasuk upah dan biaya, ada di kamus DS.

**Definisi target:** menit dari kurir mengklaim pesanan (`ditugaskan_at`, di app ACCEPTED → PICKING) sampai kurir tiba di pelanggan (`tiba_at`, di app DELIVERED). Rentang data sekarang 3–59 menit. Waktu sebelum klaim tidak termasuk.

### Kolom yang menjadi kontrak

| Kolom DS | Field kontrak | Peran | Keterangan |
|---|---|---|---|
| `order_id` | – | id | Hanya untuk penelusuran, bukan fitur. Di data real: `orders.id`, bukan `orders.code` |
| `ditugaskan_at` | – | waktu split | Saat klaim, WIB. Dipakai untuk split dan menurunkan `jam`, `hari_minggu` |
| `kurir_id` | – | id kelompok | Bukan fitur (kurir baru tidak punya riwayat) |
| `jarak_rute_km` | `distance_km` | fitur inti | Jarak rute satu arah (`orders.route_distance_km`) |
| `berat_total_kg` | `weight_kg` | fitur inti | Boleh kosong; diimputasi median train, `berat_estimasi` = 1 |
| `jumlah_item` | `item_count` | fitur inti | Jumlah baris barang, bukan jumlah unit |
| `jam` | `hour` | fitur inti | Jam desimal saat klaim (9,5 = 09:30) |
| `hari_minggu` | `dow` | fitur inti | 0 = Senin … 6 = Minggu. Data sintetis tidak punya order hari Minggu |
| `klaster_motor` | `motor_cluster` | fitur tambahan | `A` (110–125 cc) atau `B` (150–160 cc) |
| `target_eta_menit` | `eta_minutes` | target | ml-api membulatkan ke atas |
| `sumber_data` | – | label sumber | `SINTETIS_SIMULASI` (= `synthetic`) |
| `split` | – | split | Menurut waktu: 70% order paling awal = train |

Fitur rekayasa (`jarak_log1p`, `jam_sin`, `jam_cos`, `hari_sin`, `hari_cos`, `is_jam_puncak`, `is_sabtu`, `kelas_jarak`, `berat_per_item`) dan scaling z-score dihitung di dalam ml-api dari field request, memakai statistik train yang disimpan bersama model. Node tidak mengirimnya.

**Artefak DS PP6 (2026-11-25):** model Ridge `v1.0-sintetis` (MAE test beku 2,90 menit, baseline 6,05), `fitur_eta.py`, `eta_inferensi.py`, `model_eta_meta.json`, `requirements_ml_api.txt` (scikit-learn 1.9.1). ml-api membungkus `prediksi_eta()` lewat adapter (lihat `contracts/CHANGELOG.md` 0.2.0). Model dilatih ulang di repo dari dataset, bukan disalin dari `.joblib` Drive, karena joblib menjalankan kode saat dimuat. Untuk itu DS menyerahkan ke `data-science/datasets/`: `dataset_model_order.csv`, `manifest_split.json`, `test_ids_beku.txt`, `preprocessor.json`, dan `pp6_eta_model.py`. Model intent dan ETA memakai versi scikit-learn yang sama.

**Tidak disajikan di kontrak v0.2:** `cabang_id` (kode dummy C01–C07 tidak bisa dipetakan ke UUID cabang di app) dan `is_macet` (tidak ada sumber lalu lintas real-time saat prediksi). Model yang disajikan dilatih tanpa keduanya; versi dengan keduanya boleh ada di notebook sebagai pembanding.

**Di luar kontrak ml-api:** `target_gagal` (klasifikasi gagal antar) dan `permintaan_harian_cabang` (forecast jumlah order) dipakai DS untuk analisis dan dasbor. Bila salah satunya disajikan lewat ml-api, endpoint baru ditambahkan ke kontrak dulu.

**Keterbatasan:** seluruh data ETA saat ini sintetis. Model hanya mempelajari rumus simulator. Ini dinyatakan di README dan laporan, dan ETA tidak dijadikan penopang Main Quest.

## 3. Dataset ulasan (spesifikasi, belum ada)

Spesifikasi awal DS: `id`, `order_id`, `rating`, `komentar`, `label_sentimen`, `sumber_data`, `split`. Hanya order DELIVERED; label positif/negatif. Bahan model tambahan opsional (AE-P4, WP-52), belum masuk kontrak.

**Status 2026-11-26: belum layak latih.** `dataset_ulasan_mentah.csv` (250 baris, kolom `ulasan_id, cabang, teks_ulasan, rating, sentimen, sumber_data`) membangkitkan teks, rating, dan sentimen secara terpisah, sehingga ketiganya tidak saling cocok (contoh `ulas_004`: teks positif, rating 2, label negatif). Pelabelan ulang dari rating tidak memperbaikinya karena rating juga acak. Perlu label ulang berdasarkan isi teks, rating diselaraskan, lalu kolom `split` ditambahkan. `dataset_ulasan_clean` berukuran sama persis dengan berkas mentah.

## 4. Serah-terima

| Dataset | Pemilik | Tenggat serah-terima |
|---|---|---|
| `intent_v0_raw.csv` | AE (Hafizh, Naufal) | Diserahkan 21 Nov 2026 |
| `dataset_intent_clean_pp4.csv` (gabungan, label dipetakan, split dibekukan) | DS | Diserahkan 25 Nov 2026 |
| `intent_v1.csv` (kebocoran diperbaiki) | AE (Hafizh) | Selesai 26 Nov 2026 |
| `dataset_model_order.csv` | DS | 1 Des 2026 |

Tenggat disepakati tiga LP pada 2026-11-26, mengikuti urutan kerja bagian 6.0 plan dan D8 (tenggat kerja 22 Des 2026).

## Persetujuan

| Peran | Nama | Tanggal |
|---|---|---|
| AE | Hafizh | 2026-11-26 |
| FS | Alga | 2026-11-26 |
| DS | Ida | 2026-11-26 |
