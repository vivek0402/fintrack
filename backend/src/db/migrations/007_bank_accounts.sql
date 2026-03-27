CREATE TABLE IF NOT EXISTS bank_accounts (
    id               SERIAL PRIMARY KEY,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    icon             TEXT NOT NULL DEFAULT '🏦',
    color            TEXT NOT NULL DEFAULT '#3b82f6',
    starting_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_default       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user    ON bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account  ON transactions(account_id);
