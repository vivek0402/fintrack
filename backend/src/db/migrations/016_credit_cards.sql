CREATE TABLE IF NOT EXISTS credit_cards (
    id                   SERIAL PRIMARY KEY,
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_name            TEXT NOT NULL,
    card_name            TEXT NOT NULL,
    last_four            CHAR(4),
    credit_limit         NUMERIC(12,2) NOT NULL DEFAULT 0,
    outstanding_balance  NUMERIC(12,2) NOT NULL DEFAULT 0,
    billing_date         INTEGER CHECK (billing_date BETWEEN 1 AND 28),
    due_days             INTEGER NOT NULL DEFAULT 20,
    network              TEXT NOT NULL DEFAULT 'Visa',
    color                TEXT NOT NULL DEFAULT '#6366f1',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_cards_user ON credit_cards(user_id);
