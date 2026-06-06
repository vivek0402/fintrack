CREATE TABLE IF NOT EXISTS user_fcm_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT NOT NULL,
    platform    TEXT NOT NULL DEFAULT 'android',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(token)
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON user_fcm_tokens(user_id);
