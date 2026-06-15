CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  target_date DATE NOT NULL,
  target_amount NUMERIC(15,2),
  current_amount NUMERIC(15,2) DEFAULT 0,
  parent_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'not_started' CHECK (status IN (
    'not_started','in_progress','achieved','missed'
  )),
  priority INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_user
  ON milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_milestones_user_target_date
  ON milestones(user_id, target_date ASC);
CREATE INDEX IF NOT EXISTS idx_milestones_user_status
  ON milestones(user_id, status);
