-- Migration 073 (EMI schema) covers principal/tenure/interest/fee/notes but
-- was never given a description, a purchase date, or a category -- all
-- needed by the entry-time "convert to EMI" endpoint (T4). Added here as a
-- follow-up ALTER rather than editing 073 directly, since 073 already
-- shipped in a prior task on this branch.
--
-- description/purchase_date get NOT NULL DEFAULT values purely so this
-- migration can't fail if it ever runs against a non-empty table; the app
-- always supplies real values on insert and never relies on the default.
ALTER TABLE credit_card_emis ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE credit_card_emis ADD COLUMN IF NOT EXISTS purchase_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- The EMI's category (e.g. "Electronics", "Travel") is stored once on the
-- EMI header rather than per-installment: every installment of a given EMI
-- is a slice of the same purchase, so they all share one category, and a
-- later task's cron (which posts installment transactions as they come due)
-- can read it from here rather than needing it duplicated on every
-- installment row. Nullable and ON DELETE SET NULL, same as
-- transactions.category_id and financial_plan_expenses.category_id -- a
-- deleted category must not block the EMI or installment cron from working.
ALTER TABLE credit_card_emis ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_credit_card_emis_category ON credit_card_emis(category_id) WHERE category_id IS NOT NULL;
