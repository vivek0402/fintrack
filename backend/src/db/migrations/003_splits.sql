CREATE TABLE IF NOT EXISTS expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  description VARCHAR(255) NOT NULL,
  split_count INTEGER NOT NULL,
  your_share DECIMAL(12,2) NOT NULL,
  participants JSONB NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
