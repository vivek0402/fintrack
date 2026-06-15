CREATE TABLE IF NOT EXISTS briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_of DATE NOT NULL,
  points JSONB NOT NULL,
  narrative TEXT NOT NULL,
  action_of_the_week TEXT NOT NULL,
  push_sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, week_of)
);

CREATE INDEX IF NOT EXISTS idx_briefings_user_week
  ON briefings(user_id, week_of DESC);
