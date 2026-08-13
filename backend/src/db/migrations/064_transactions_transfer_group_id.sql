-- Pairs the two legs of a money-movement transaction (e.g. a credit card bill
-- payment) so deleting one leg can delete its pair too, instead of leaving an
-- orphaned half-transaction. Not retrofitted onto pre-existing transfer rows,
-- which predate this column.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_group_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_transfer_group ON transactions(transfer_group_id);
