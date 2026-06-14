CREATE TABLE IF NOT EXISTS tax_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  investment_id UUID REFERENCES investments(id) ON DELETE SET NULL,
  type VARCHAR(30) NOT NULL,
  name TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  deduction_section VARCHAR(10) NOT NULL DEFAULT '80C',
  financial_year VARCHAR(7) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_investments_user_fy
  ON tax_investments(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_tax_investments_section
  ON tax_investments(user_id, financial_year, deduction_section);
