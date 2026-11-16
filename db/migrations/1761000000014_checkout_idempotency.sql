-- Up Migration

-- One row per checkout intent. The client sends the same Idempotency-Key on every retry of one "Bayar" press;
-- the row is written in the same transaction as the order, so a retry finds either nothing (the first attempt
-- rolled back and may run again) or the order it created (replayed, never created twice).
-- The order FK is deferred: the claim is inserted first, so a concurrent duplicate blocks on the primary key
-- before it locks the cart or touches stock, and the order row it points to follows in the same transaction.
CREATE TABLE checkout_requests (
  customer_id uuid NOT NULL REFERENCES users(id),
  idempotency_key uuid NOT NULL,
  request_hash char(64) NOT NULL,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  PRIMARY KEY (customer_id, idempotency_key)
);

CREATE INDEX checkout_requests_expiry_idx ON checkout_requests (expires_at);

-- Down Migration

DROP INDEX checkout_requests_expiry_idx;
DROP TABLE checkout_requests;
