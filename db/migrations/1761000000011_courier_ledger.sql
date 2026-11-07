-- Up Migration

CREATE TYPE courier_ledger_type AS ENUM ('EARNING', 'WITHDRAWAL');

-- Append-only; a courier's balance is SUM(amount). Balances start at 0: orders finished before this table are not credited.
CREATE TABLE courier_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL REFERENCES couriers(user_id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  type courier_ledger_type NOT NULL,
  amount integer NOT NULL,
  order_id uuid UNIQUE REFERENCES orders(id),
  recorded_by uuid REFERENCES users(id),
  idempotency_key uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (courier_id, idempotency_key),
  CONSTRAINT courier_ledger_shape CHECK (
    (type = 'EARNING' AND amount > 0 AND order_id IS NOT NULL AND recorded_by IS NULL AND idempotency_key IS NULL)
    OR (type = 'WITHDRAWAL' AND amount < 0 AND order_id IS NULL AND recorded_by IS NOT NULL AND idempotency_key IS NOT NULL)
  )
);

CREATE INDEX courier_ledger_recent ON courier_ledger_entries (courier_id, created_at DESC, id DESC);

-- Down Migration

DROP TABLE courier_ledger_entries;
DROP TYPE courier_ledger_type;
