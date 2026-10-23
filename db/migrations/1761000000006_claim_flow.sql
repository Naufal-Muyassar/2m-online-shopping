-- Up Migration

ALTER TABLE orders ADD COLUMN accepted_at timestamptz;
CREATE INDEX orders_accepted_idx ON orders (branch_id, accepted_at) WHERE status = 'ACCEPTED';

-- Down Migration

DROP INDEX orders_accepted_idx;
ALTER TABLE orders DROP COLUMN accepted_at;
