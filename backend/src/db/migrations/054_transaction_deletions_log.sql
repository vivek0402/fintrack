-- Hard deletes on transactions (DELETE /api/transactions/:id) leave no trace
-- today, which makes a delete-rate-by-source comparison impossible. This log
-- captures just enough to compute that rate -- not a full undo/audit trail.

CREATE TABLE IF NOT EXISTS transaction_deletions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source     VARCHAR(20) NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_deletions_user
    ON transaction_deletions(user_id);
