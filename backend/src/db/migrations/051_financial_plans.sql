CREATE TABLE IF NOT EXISTS financial_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  monthly_income NUMERIC(15,2) NOT NULL,
  risk_profile VARCHAR(10) NOT NULL DEFAULT 'balanced' CHECK (risk_profile IN (
    'safety','balanced','growth'
  )),
  emergency_fund_target_months INTEGER NOT NULL DEFAULT 6,
  emergency_fund_current_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  goal_name TEXT,
  goal_amount NUMERIC(15,2),
  goal_target_months INTEGER,
  loan_principal NUMERIC(15,2),
  loan_annual_rate_pct NUMERIC(6,3),
  loan_tenure_months INTEGER,
  loan_moratorium_months INTEGER DEFAULT 0,
  ai_narrative JSONB,
  ai_narrative_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_plan_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES financial_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_plan_expenses_plan
  ON financial_plan_expenses(plan_id);
