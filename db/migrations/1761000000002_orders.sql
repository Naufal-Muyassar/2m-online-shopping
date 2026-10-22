-- Up Migration

CREATE TYPE order_status AS ENUM (
  'CREATED', 'PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'PICKING', 'READY',
  'ASSIGNED', 'ON_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED'
);
CREATE TYPE outbox_status AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  branch_id uuid NOT NULL REFERENCES branches(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  address_id uuid NOT NULL REFERENCES addresses(id),
  status order_status NOT NULL DEFAULT 'CREATED',
  subtotal integer NOT NULL,
  delivery_fee integer NOT NULL DEFAULT 0,
  payment_fee integer NOT NULL DEFAULT 0,
  voucher_discount integer NOT NULL DEFAULT 0,
  grand_total integer NOT NULL,
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_method text,
  invoice_id text,
  invoice_url text,
  invoice_expires_at timestamptz,
  assigned_courier_id uuid REFERENCES couriers(user_id),
  return_pending boolean NOT NULL DEFAULT false,
  is_bulk_order boolean NOT NULL DEFAULT false,
  ready_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  product_id uuid NOT NULL REFERENCES products(id),
  sku text NOT NULL,
  name text NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  unit_price integer NOT NULL,
  weight_kg numeric(8,3) NOT NULL,
  picked_qty integer
);

CREATE TABLE order_state_transitions (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  from_status order_status,
  to_status order_status NOT NULL,
  actor_id uuid REFERENCES users(id),
  actor_role text NOT NULL,
  server_ts timestamptz NOT NULL DEFAULT now(),
  client_ts timestamptz,
  lat double precision,
  lng double precision,
  accuracy double precision,
  reason text,
  idempotency_key uuid
);

CREATE UNIQUE INDEX order_state_transitions_idem_uq
  ON order_state_transitions (order_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial NOT NULL UNIQUE,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status outbox_status NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  branch_id uuid NOT NULL REFERENCES branches(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE courier_pings (
  id bigserial PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES couriers(user_id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  order_id uuid REFERENCES orders(id),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  battery smallint,
  client_ts timestamptz NOT NULL,
  server_ts timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proof_of_delivery (
  order_id uuid PRIMARY KEY REFERENCES orders(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  photo_key text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  taken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  actor_role text NOT NULL,
  branch_id uuid REFERENCES branches(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before jsonb,
  after jsonb,
  ip text,
  ts timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_branch_status_created_idx ON orders (branch_id, status, created_at);
CREATE INDEX orders_ready_idx ON orders (branch_id, ready_at) WHERE status = 'READY';
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX couriers_branch_status_idx ON couriers (branch_id, status, last_status_change);
CREATE INDEX outbox_events_pending_idx ON outbox_events (next_retry_at) WHERE status = 'PENDING';
CREATE INDEX outbox_events_seq_idx ON outbox_events (seq);
CREATE INDEX order_state_transitions_order_idx ON order_state_transitions (order_id, server_ts);
CREATE INDEX courier_pings_courier_idx ON courier_pings (courier_id, server_ts);

CREATE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % rejected', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER order_state_transitions_immutable
  BEFORE UPDATE OR DELETE ON order_state_transitions
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- Down Migration

DROP TRIGGER order_state_transitions_immutable ON order_state_transitions;
DROP TRIGGER audit_logs_immutable ON audit_logs;
DROP FUNCTION reject_mutation();
DROP TABLE audit_logs;
DROP TABLE proof_of_delivery;
DROP TABLE courier_pings;
DROP TABLE outbox_events;
DROP TABLE order_state_transitions;
DROP TABLE order_items;
DROP TABLE orders;
DROP TYPE outbox_status;
DROP TYPE order_status;
