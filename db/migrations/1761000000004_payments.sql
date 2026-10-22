-- Up Migration

-- Every Xendit callback is stored once per (invoice_id, status); raw_body is the exact request body.
-- headers never contain x-callback-token.
CREATE TABLE payment_events (
  id bigserial PRIMARY KEY,
  provider text NOT NULL DEFAULT 'xendit',
  invoice_id text NOT NULL,
  external_id text,
  status text NOT NULL,
  raw_body text NOT NULL,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text,
  processed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, status)
);

-- Fee Xendit actually charged for the paid invoice (when reported); the customer-facing fee stays in payment_fee.
ALTER TABLE orders ADD COLUMN payment_fee_actual integer;

CREATE INDEX orders_pending_payment_idx ON orders (created_at) WHERE status IN ('CREATED', 'PENDING_PAYMENT');
CREATE UNIQUE INDEX orders_invoice_id_uq ON orders (invoice_id) WHERE invoice_id IS NOT NULL;

INSERT INTO payment_fee_config (payment_method, absorbed) VALUES
  ('QRIS', true), ('VA_BCA', true), ('VA_BNI', true), ('VA_BRI', true), ('VA_MANDIRI', true), ('EWALLET', true)
ON CONFLICT (payment_method) DO NOTHING;

-- Down Migration

DROP INDEX orders_invoice_id_uq;
DROP INDEX orders_pending_payment_idx;
ALTER TABLE orders DROP COLUMN payment_fee_actual;
DROP TABLE payment_events;
