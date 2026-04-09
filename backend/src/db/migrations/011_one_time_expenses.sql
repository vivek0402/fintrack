CREATE TABLE IF NOT EXISTS one_time_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'Other',
  date DATE NOT NULL,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  icon VARCHAR(50) DEFAULT 'receipt',
  color VARCHAR(20) DEFAULT '#a855f7',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_one_time_expenses_user_id ON one_time_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_one_time_expenses_date ON one_time_expenses(date DESC);
