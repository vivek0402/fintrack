CREATE TABLE IF NOT EXISTS notification_log (
    id         SERIAL PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_key  TEXT NOT NULL,
    sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, alert_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log(user_id);
