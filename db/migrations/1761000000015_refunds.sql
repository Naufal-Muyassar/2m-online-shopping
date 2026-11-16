-- Up Migration

CREATE TYPE refund_status AS ENUM ('NEEDS_DESTINATION', 'READY', 'COMPLETED');
CREATE TYPE refund_reason AS ENUM ('ORDER_CANCELLED', 'ITEM_SHORTAGE', 'LATE_PAYMENT', 'OTHER');

-- Money owed back to a customer for one order. Opened by the system in the same transaction as the event that
-- causes it (dedupe_key makes a replayed event a no-op) or by an admin (dedupe_key = 'manual:<idempotency key>').
-- Closed only with a transfer reference and a receipt photo, both shown to the customer.
-- The sum of refunds per order never exceeds the order total: every insert runs under the order row lock.
CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  reason refund_reason NOT NULL,
  note text,
  amount integer NOT NULL CHECK (amount > 0),
  dedupe_key text NOT NULL,
  status refund_status NOT NULL DEFAULT 'NEEDS_DESTINATION',
  dest_method text CHECK (dest_method IN ('BANK', 'EWALLET')),
  dest_provider text,
  dest_account_no text,
  dest_account_name text,
  dest_set_at timestamptz,
  transfer_ref text,
  proof_key text,
  created_by uuid REFERENCES users(id),
  completed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (order_id, dedupe_key),
  CONSTRAINT refunds_destination_before_ready CHECK (status = 'NEEDS_DESTINATION' OR dest_account_no IS NOT NULL),
  CONSTRAINT refunds_completed_has_proof CHECK (
    (status = 'COMPLETED') = (proof_key IS NOT NULL AND transfer_ref IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX refunds_branch_status_idx ON refunds (branch_id, status, created_at);
CREATE INDEX refunds_order_idx ON refunds (order_id);

-- Down Migration

DROP INDEX refunds_order_idx;
DROP INDEX refunds_branch_status_idx;
DROP TABLE refunds;
DROP TYPE refund_reason;
DROP TYPE refund_status;
