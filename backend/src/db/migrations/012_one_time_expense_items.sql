-- Line-item spending within a one-time expense
CREATE TABLE IF NOT EXISTS one_time_expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES one_time_expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category VARCHAR(100) DEFAULT 'Other',
  date DATE NOT NULL,
  payment_method VARCHAR(50) DEFAULT 'Cash',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_items_expense_id ON one_time_expense_items(expense_id);

-- Extend parent table for computed total + date range
ALTER TABLE one_time_expenses ADD COLUMN IF NOT EXISTS computed_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE one_time_expenses ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE one_time_expenses ADD COLUMN IF NOT EXISTS end_date DATE;
