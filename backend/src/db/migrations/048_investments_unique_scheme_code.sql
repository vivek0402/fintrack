-- Prevents duplicate mutual fund holdings from concurrent/double-submitted buys.
-- Safe to add now: scheme_code is a brand-new column (047) and is NULL on every
-- existing row, so this constraint cannot conflict with pre-existing data.
CREATE UNIQUE INDEX IF NOT EXISTS idx_investments_unique_user_scheme
  ON investments(user_id, scheme_code) WHERE scheme_code IS NOT NULL;
