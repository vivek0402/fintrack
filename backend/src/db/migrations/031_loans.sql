CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN (
    'home_loan','car_loan','personal_loan','education_loan','gold_loan','business_loan','other'
  )),
  principal_amount NUMERIC(15,2) NOT NULL CHECK (principal_amount > 0),
  disbursement_date DATE NOT NULL,
  tenure_months INTEGER NOT NULL CHECK (tenure_months > 0),
  interest_rate_pct NUMERIC(6,3) NOT NULL CHECK (interest_rate_pct > 0),
  emi_amount NUMERIC(12,2),
  outstanding_balance NUMERIC(15,2) NOT NULL CHECK (outstanding_balance >= 0),
  bank_or_lender TEXT,
  account_number_last4 VARCHAR(4),
  prepayment_penalty_pct NUMERIC(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_user
  ON loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_user_active
  ON loans(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_loans_user_type
  ON loans(user_id, type);
