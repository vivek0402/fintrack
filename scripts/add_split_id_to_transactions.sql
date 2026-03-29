-- Migration: Add split_id FK to transactions
-- Run once against your PostgreSQL database.
-- This links group split records directly to their transactions,
-- replacing the fragile description-string match used previously.

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS split_id INTEGER REFERENCES group_splits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_split_id ON transactions(split_id);

-- Backfill: try to match existing transactions to splits by group_id + description
-- (best-effort; orphans stay NULL and are harmless)
UPDATE transactions t
SET split_id = gs.id
FROM group_splits gs
WHERE t.group_id = gs.group_id
  AND t.description = gs.description
  AND t.split_id IS NULL
  AND t.tags @> '{group-split}';
