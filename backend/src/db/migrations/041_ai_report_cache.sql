CREATE TABLE IF NOT EXISTS ai_report_cache (
    id          SERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month       INTEGER NOT NULL,
    year        INTEGER NOT NULL,
    fingerprint TEXT    NOT NULL,
    report      TEXT    NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_ai_report_cache_user_month_year
    ON ai_report_cache (user_id, month, year);
