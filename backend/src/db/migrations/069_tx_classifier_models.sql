CREATE TABLE IF NOT EXISTS tx_classifier_models (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    model         JSONB NOT NULL DEFAULT '{}',
    trained_count INTEGER NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
