-- In-app notification feed, backing the notification bell. Previously the bell
-- read/wrote localStorage only (no cross-device sync, lost on clear). The id is
-- a deterministic string computed client-side per alert (e.g.
-- "budget-<category_id>-<month>-<year>") so repeated rule evaluation can no-op
-- via ON CONFLICT instead of needing a separate dedup table/check.
CREATE TABLE IF NOT EXISTS notifications (
    id          TEXT NOT NULL,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    body        TEXT,
    type        TEXT,
    deep_link   TEXT,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;
