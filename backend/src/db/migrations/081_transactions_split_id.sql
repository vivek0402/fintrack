-- Which group split a transaction belongs to. routes/groups.js writes it
-- when a split is created and clears it when the split or group is deleted.
-- Production got this column from a hand-run script (scripts/
-- add_split_id_to_transactions.sql, now removed) that also backfilled old
-- rows; this migration only makes sure fresh databases have the column.
-- No-op where it already exists.
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS split_id INTEGER REFERENCES group_splits(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_split_id ON transactions(split_id);
