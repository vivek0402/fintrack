CREATE TABLE IF NOT EXISTS daily_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brief_date DATE NOT NULL,
  points JSONB NOT NULL,
  narrative TEXT NOT NULL,
  action_of_the_day TEXT NOT NULL,
  push_sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, brief_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_briefings_user_date
  ON daily_briefings(user_id, brief_date DESC);
