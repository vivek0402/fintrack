CREATE TABLE IF NOT EXISTS scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type VARCHAR(25) NOT NULL CHECK (type IN (
    'investment_growth','loan_impact','expense_reduction','income_change'
  )),
  inputs_json JSONB NOT NULL,
  result_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenarios_user_created
  ON scenarios(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scenarios_user_type
  ON scenarios(user_id, type);
