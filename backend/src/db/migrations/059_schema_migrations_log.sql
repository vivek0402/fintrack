CREATE TABLE IF NOT EXISTS schema_migrations_log (
    id BIGSERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    error_message TEXT,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_log_filename ON schema_migrations_log(filename, run_at DESC);
