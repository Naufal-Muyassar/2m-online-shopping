-- Up Migration

-- True when the order was settled through the mock provider or by an admin "force paid"; excluded from financial KPIs.
ALTER TABLE orders ADD COLUMN is_demo_payment boolean NOT NULL DEFAULT false;

-- Down Migration

ALTER TABLE orders DROP COLUMN is_demo_payment;
