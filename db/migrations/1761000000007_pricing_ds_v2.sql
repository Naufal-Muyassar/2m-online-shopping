-- Up Migration

ALTER TABLE branch_pricing_config
  ADD COLUMN pricing_model text NOT NULL DEFAULT 'ds_v2' CHECK (pricing_model IN ('ds_v2', 'linear')),
  ADD COLUMN wage_base integer NOT NULL DEFAULT 3500,
  ADD COLUMN wage_per_km integer NOT NULL DEFAULT 1500,
  ADD COLUMN failed_rate numeric NOT NULL DEFAULT 0.03,
  ADD COLUMN failed_pay_fraction numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN failed_fee_charged_fraction numeric NOT NULL DEFAULT 0,
  ADD COLUMN overhead_per_day integer NOT NULL DEFAULT 10000,
  ADD COLUMN drops_per_day integer NOT NULL DEFAULT 15 CHECK (drops_per_day > 0),
  ADD COLUMN round_to integer NOT NULL DEFAULT 500 CHECK (round_to > 0),
  ADD COLUMN cap_min_fee integer NOT NULL DEFAULT 7500,
  ADD COLUMN cap_free_km numeric NOT NULL DEFAULT 4,
  ADD COLUMN cap_per_km numeric(10,2) NOT NULL DEFAULT 1333.33;

ALTER TABLE orders
  ADD COLUMN route_distance_km numeric(6,2),
  ADD COLUMN courier_wage integer,
  ADD COLUMN courier_pay_final integer;

ALTER TABLE couriers
  ADD COLUMN motor_code text CHECK (motor_code ~ '^M[1-7]$'),
  ADD COLUMN motor_cluster char(1) CHECK (motor_cluster IN ('A', 'B'));

-- Reference only: pricing never reads it. Source: Draft_DS_Kurir_v2.xlsx T2 (confidence D).
CREATE TABLE motor_clusters (
  cluster char(1) PRIMARY KEY,
  cc_range text NOT NULL,
  cost_per_km_normal numeric NOT NULL,
  cost_per_km_macet numeric NOT NULL
);

INSERT INTO motor_clusters (cluster, cc_range, cost_per_km_normal, cost_per_km_macet) VALUES
  ('A', '110-125', 518.75, 553.08),
  ('B', '150-160', 699.99, 741.65);

-- Down Migration

DROP TABLE motor_clusters;
ALTER TABLE couriers DROP COLUMN motor_cluster, DROP COLUMN motor_code;
ALTER TABLE orders DROP COLUMN courier_pay_final, DROP COLUMN courier_wage, DROP COLUMN route_distance_km;
ALTER TABLE branch_pricing_config
  DROP COLUMN cap_per_km, DROP COLUMN cap_free_km, DROP COLUMN cap_min_fee, DROP COLUMN round_to,
  DROP COLUMN drops_per_day, DROP COLUMN overhead_per_day, DROP COLUMN failed_fee_charged_fraction,
  DROP COLUMN failed_pay_fraction, DROP COLUMN failed_rate, DROP COLUMN wage_per_km, DROP COLUMN wage_base,
  DROP COLUMN pricing_model;
