-- Up Migration

CREATE TABLE carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, branch_id)
);

CREATE TABLE cart_items (
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id),
  product_id uuid NOT NULL REFERENCES products(id),
  qty integer NOT NULL CHECK (qty > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cart_id, product_id)
);

-- absorbed = true: the business pays the fee, the customer is charged 0.
CREATE TABLE payment_fee_config (
  payment_method text PRIMARY KEY,
  absorbed boolean NOT NULL DEFAULT true,
  fee_flat integer NOT NULL DEFAULT 0,
  fee_percent numeric(5,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO payment_fee_config (payment_method, absorbed) VALUES
  ('QRIS', true), ('VA_BCA', true), ('VA_BNI', true), ('VA_BRI', true), ('VA_MANDIRI', true), ('EWALLET', true);

CREATE INDEX addresses_user_idx ON addresses (user_id);

-- Down Migration

DROP INDEX addresses_user_idx;
DROP TABLE payment_fee_config;
DROP TABLE cart_items;
DROP TABLE carts;
