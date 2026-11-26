-- Up Migration

-- Ongkir bertingkat menurut jarak rute satu arah (keputusan pemilik 2026-11-26): tarif tetap per tingkat sampai
-- tingkat terakhir, lalu + tier_extra_per_km per km berikutnya, dibulatkan ke round_to terdekat. Upah kurir tidak
-- berubah (wage_base + wage_per_km × km). Semua cabang ds_v2 pindah ke tiered; linear tetap bisa dipilih.
ALTER TABLE branch_pricing_config DROP CONSTRAINT branch_pricing_config_pricing_model_check;
ALTER TABLE branch_pricing_config
  ADD CONSTRAINT branch_pricing_config_pricing_model_check CHECK (pricing_model IN ('tiered', 'ds_v2', 'linear'));
ALTER TABLE branch_pricing_config
  ADD COLUMN fee_tiers jsonb NOT NULL DEFAULT
    '[{"max_km":0.75,"fee":5500},{"max_km":1,"fee":6000},{"max_km":1.25,"fee":6500},{"max_km":1.75,"fee":7000},{"max_km":4,"fee":7500}]'::jsonb
    CONSTRAINT branch_pricing_config_fee_tiers_check CHECK (jsonb_typeof(fee_tiers) = 'array' AND jsonb_array_length(fee_tiers) > 0),
  ADD COLUMN tier_extra_per_km integer NOT NULL DEFAULT 1333
    CONSTRAINT branch_pricing_config_tier_extra_per_km_check CHECK (tier_extra_per_km >= 0);
ALTER TABLE branch_pricing_config ALTER COLUMN pricing_model SET DEFAULT 'tiered';
UPDATE branch_pricing_config SET pricing_model = 'tiered' WHERE pricing_model = 'ds_v2';

-- Pesanan gagal diantar: semua yang dibayar pelanggan (barang + ongkir) dikembalikan otomatis.
ALTER TYPE refund_reason ADD VALUE IF NOT EXISTS 'DELIVERY_FAILED';

-- Dompet 2M: dana penyangga dari selisih ongkir dan upah kurir, bukan laba. Dipakai menutup ongkir pesanan gagal,
-- subsidi jarak jauh (ongkir < upah), voucher ongkir, dan biaya operasional seperti Google Maps API.
-- Append-only; saldo = SUM(amount). Entri pesanan ditulis sekali saat pesanan selesai (DELIVERED atau FAILED);
-- UNIQUE (order_id, type) membuat penulisan ulang tidak berefek. Entri manual dicatat super_admin dengan
-- idempotency_key. Pesanan yang selesai sebelum tabel ini tidak dicatat.
CREATE TYPE platform_wallet_type AS ENUM ('ONGKIR_IN', 'COURIER_PAY', 'ONGKIR_REFUND', 'VOUCHER', 'EXPENSE', 'TOP_UP');
CREATE TYPE platform_expense_category AS ENUM ('MAPS_API', 'REFUND_COST', 'PAYMENT_FEE', 'OTHER');

CREATE TABLE platform_wallet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL hanya untuk biaya pusat yang tidak terikat cabang (mis. tagihan Google Maps API).
  branch_id uuid REFERENCES branches(id),
  order_id uuid REFERENCES orders(id),
  type platform_wallet_type NOT NULL,
  category platform_expense_category,
  amount integer NOT NULL,
  note text,
  recorded_by uuid REFERENCES users(id),
  idempotency_key uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, type),
  CONSTRAINT platform_wallet_shape CHECK (
    (type = 'ONGKIR_IN' AND amount > 0 AND order_id IS NOT NULL AND branch_id IS NOT NULL
      AND category IS NULL AND recorded_by IS NULL AND idempotency_key IS NULL)
    OR (type IN ('COURIER_PAY', 'ONGKIR_REFUND', 'VOUCHER') AND amount < 0 AND order_id IS NOT NULL AND branch_id IS NOT NULL
      AND category IS NULL AND recorded_by IS NULL AND idempotency_key IS NULL)
    OR (type = 'EXPENSE' AND amount < 0 AND order_id IS NULL AND category IS NOT NULL
      AND recorded_by IS NOT NULL AND idempotency_key IS NOT NULL AND note IS NOT NULL)
    OR (type = 'TOP_UP' AND amount > 0 AND order_id IS NULL AND category IS NULL
      AND recorded_by IS NOT NULL AND idempotency_key IS NOT NULL AND note IS NOT NULL)
  )
);

CREATE INDEX platform_wallet_recent ON platform_wallet_entries (created_at DESC, id DESC);
CREATE INDEX platform_wallet_branch_recent ON platform_wallet_entries (branch_id, created_at DESC, id DESC);

-- Down Migration

DROP TABLE platform_wallet_entries;
DROP TYPE platform_expense_category;
DROP TYPE platform_wallet_type;
UPDATE branch_pricing_config SET pricing_model = 'ds_v2' WHERE pricing_model = 'tiered';
ALTER TABLE branch_pricing_config ALTER COLUMN pricing_model SET DEFAULT 'ds_v2';
ALTER TABLE branch_pricing_config DROP COLUMN tier_extra_per_km, DROP COLUMN fee_tiers;
ALTER TABLE branch_pricing_config DROP CONSTRAINT branch_pricing_config_pricing_model_check;
ALTER TABLE branch_pricing_config
  ADD CONSTRAINT branch_pricing_config_pricing_model_check CHECK (pricing_model IN ('ds_v2', 'linear'));
