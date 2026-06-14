CREATE TABLE IF NOT EXISTS loan_prepayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  prepayment_date DATE NOT NULL,
  months_saved INTEGER,
  interest_saved NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_prepayments_loan
  ON loan_prepayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_prepayments_user_date
  ON loan_prepayments(user_id, prepayment_date DESC);
