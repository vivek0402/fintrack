-- Tracks where each transaction originated so Phase 0 of the growth roadmap
-- (docs/GROWTH_BRIEF_10000X.md) can compare edit/delete rates by entry method
-- before deciding whether import-first onboarding is worth pursuing.
-- No retroactive backfill: existing rows have no reliable way to map back to
-- their originating import job, so they default to 'manual' going forward.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'sms', 'cams_import', 'pdf_import'));

CREATE INDEX IF NOT EXISTS idx_transactions_user_source
    ON transactions(user_id, source);
