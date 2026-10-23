-- Up Migration

-- Stand-in for the payment gateway when PAYMENT_PROVIDER=mock. Never used in production.
CREATE TABLE mock_invoices (
  invoice_id text PRIMARY KEY,
  external_id text NOT NULL UNIQUE,
  amount integer NOT NULL,
  method text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'EXPIRED')),
  expires_at timestamptz NOT NULL,
  paid_at timestamptz
);

-- Down Migration

DROP TABLE mock_invoices;
