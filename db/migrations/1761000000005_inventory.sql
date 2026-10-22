-- Up Migration

CREATE TYPE reservation_status AS ENUM ('ACTIVE', 'COMMITTED', 'RELEASED');

-- Stand-in for the central stock API (behind StockProvider). A missing row means no sellable stock.
CREATE TABLE stock_snapshots (
  branch_id uuid NOT NULL REFERENCES branches(id),
  product_id uuid NOT NULL REFERENCES products(id),
  qty integer NOT NULL CHECK (qty >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, product_id)
);

-- Units kept back from sale: sellable = snapshot - reserved - stock_buffer.
ALTER TABLE branch_products ADD COLUMN stock_buffer integer NOT NULL DEFAULT 0 CHECK (stock_buffer >= 0);

-- Source of truth for reservations; Redis counters are rebuilt from ACTIVE + COMMITTED rows.
CREATE TABLE stock_reservations (
  order_id uuid NOT NULL REFERENCES orders(id),
  product_id uuid NOT NULL REFERENCES products(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  invoice_id text,
  qty integer NOT NULL CHECK (qty > 0),
  expires_at timestamptz NOT NULL,
  status reservation_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, product_id)
);

CREATE INDEX stock_reservations_expiry_idx ON stock_reservations (expires_at) WHERE status = 'ACTIVE';
CREATE INDEX stock_reservations_held_idx ON stock_reservations (branch_id, product_id) WHERE status IN ('ACTIVE', 'COMMITTED');

-- Down Migration

DROP INDEX stock_reservations_held_idx;
DROP INDEX stock_reservations_expiry_idx;
DROP TABLE stock_reservations;
ALTER TABLE branch_products DROP COLUMN stock_buffer;
DROP TABLE stock_snapshots;
DROP TYPE reservation_status;
