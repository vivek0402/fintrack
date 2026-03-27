-- Add group_id to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS group_id INTEGER;

CREATE TABLE IF NOT EXISTS expense_groups (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    emoji       TEXT NOT NULL DEFAULT '👥',
    description TEXT,
    budget      NUMERIC(12,2),
    currency    TEXT NOT NULL DEFAULT 'INR',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
    id         SERIAL PRIMARY KEY,
    group_id   INTEGER NOT NULL REFERENCES expense_groups(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    email      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_splits (
    id           SERIAL PRIMARY KEY,
    group_id     INTEGER NOT NULL REFERENCES expense_groups(id) ON DELETE CASCADE,
    description  TEXT NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    paid_by      TEXT NOT NULL,
    date         DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_split_shares (
    id         SERIAL PRIMARY KEY,
    split_id   INTEGER NOT NULL REFERENCES group_splits(id) ON DELETE CASCADE,
    member     TEXT NOT NULL,
    amount     NUMERIC(12,2) NOT NULL,
    settled    BOOLEAN NOT NULL DEFAULT FALSE,
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_expense_groups_user ON expense_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_splits_group  ON group_splits(group_id);
CREATE INDEX IF NOT EXISTS idx_transactions_group  ON transactions(group_id);
