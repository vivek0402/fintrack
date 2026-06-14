CREATE TABLE IF NOT EXISTS tax_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  financial_year VARCHAR(9) NOT NULL,
  section VARCHAR(10) NOT NULL CHECK (section IN (
    '80C','80CCD1B','80D','80E','80G','80TTA','other'
  )),
  category TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  investment_id UUID REFERENCES investments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_deductions_user_fy
  ON tax_deductions(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_tax_deductions_section
  ON tax_deductions(user_id, financial_year, section);
