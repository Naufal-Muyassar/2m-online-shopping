-- Up Migration

-- The courier's balance right after a withdrawal, printed on the withdrawal slip. NULL on earnings and on
-- withdrawals recorded before this column; the slip then sums the ledger up to that entry instead.
ALTER TABLE courier_ledger_entries
  ADD COLUMN balance_after integer,
  ADD CONSTRAINT courier_ledger_balance_after CHECK (balance_after IS NULL OR type = 'WITHDRAWAL');

-- Down Migration

ALTER TABLE courier_ledger_entries
  DROP CONSTRAINT courier_ledger_balance_after,
  DROP COLUMN balance_after;
