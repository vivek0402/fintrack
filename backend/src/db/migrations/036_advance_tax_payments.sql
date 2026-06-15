CREATE TABLE IF NOT EXISTS advance_tax_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  financial_year VARCHAR(7) NOT NULL,
  installment_number INTEGER NOT NULL CHECK (installment_number BETWEEN 1 AND 4),
  due_date DATE NOT NULL,
  cumulative_pct_due INTEGER NOT NULL,
  estimated_amount_due NUMERIC(12,2) DEFAULT 0,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  paid_on_date DATE,
  payment_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, financial_year, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_advance_tax_payments_user_fy
  ON advance_tax_payments(user_id, financial_year);
