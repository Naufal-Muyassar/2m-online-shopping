-- Up Migration

CREATE TYPE user_role AS ENUM ('customer', 'courier', 'branch_admin', 'super_admin');
CREATE TYPE courier_status AS ENUM ('IDLE', 'DELIVERING', 'OFFLINE');

CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  service_radius_m integer NOT NULL,
  open_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  is_active boolean NOT NULL DEFAULT true,
  erp_branch_id text,
  courier_capacity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branch_pricing_config (
  branch_id uuid PRIMARY KEY REFERENCES branches(id),
  base_fee integer NOT NULL,
  per_km integer NOT NULL,
  free_km numeric(6,2) NOT NULL DEFAULT 0,
  weight_threshold_kg numeric(8,2) NOT NULL,
  surcharge_per_kg integer NOT NULL,
  fee_min integer NOT NULL,
  fee_max integer NOT NULL,
  min_order integer NOT NULL,
  circuity_factor numeric(4,2) NOT NULL DEFAULT 1.3,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branch_limits (
  branch_id uuid PRIMARY KEY REFERENCES branches(id),
  max_qty_per_sku_default integer NOT NULL,
  max_order_weight_kg numeric(8,2) NOT NULL,
  heavy_order_threshold_kg numeric(8,2) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE courier_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  fee_per_drop integer NOT NULL,
  contract_ref text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role user_role NOT NULL,
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  email text UNIQUE,
  password_hash text NOT NULL,
  branch_id uuid REFERENCES branches(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE couriers (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  partner_id uuid NOT NULL REFERENCES courier_partners(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  status courier_status NOT NULL DEFAULT 'OFFLINE',
  last_status_change timestamptz NOT NULL DEFAULT now(),
  last_ping_at timestamptz,
  current_lat double precision,
  current_lng double precision
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  refresh_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_token_idx ON sessions (refresh_token_hash);

CREATE TABLE addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  label text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  geohash text,
  street text NOT NULL,
  rt_rw text,
  unit text,
  receiver_name text NOT NULL,
  receiver_phone text NOT NULL,
  courier_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  unit text NOT NULL,
  category text NOT NULL,
  weight_kg numeric(8,3) NOT NULL,
  dimension_cm jsonb,
  weight_source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branch_products (
  branch_id uuid NOT NULL REFERENCES branches(id),
  product_id uuid NOT NULL REFERENCES products(id),
  price integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (branch_id, product_id)
);

-- Down Migration

DROP TABLE branch_products;
DROP TABLE products;
DROP TABLE addresses;
DROP TABLE sessions;
DROP TABLE couriers;
DROP TABLE users;
DROP TABLE courier_partners;
DROP TABLE branch_limits;
DROP TABLE branch_pricing_config;
DROP TABLE branches;
DROP TYPE courier_status;
DROP TYPE user_role;
