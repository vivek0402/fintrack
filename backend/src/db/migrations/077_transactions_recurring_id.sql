-- Which recurring item posted a transaction. Before this, nothing recorded
-- it, so repairs (scripts/repair-recurring-anchors.js) had to match postings
-- on description and amount. Set by utils/recurringPosting.js; NULL for
-- everything else and for postings made before this column existed.
-- Deleting the recurring item keeps its past transactions (SET NULL).
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS recurring_id UUID REFERENCES recurring_transactions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_recurring_id
    ON transactions(recurring_id) WHERE recurring_id IS NOT NULL;
