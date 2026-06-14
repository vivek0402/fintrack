CREATE TABLE IF NOT EXISTS investment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(10) NOT NULL
    CHECK (transaction_type IN ('buy','sell','dividend','bonus')),
  units NUMERIC(20,6) NOT NULL,
  price_per_unit NUMERIC(15,2) NOT NULL CHECK (price_per_unit >= 0),
  transaction_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_txn_user
  ON investment_transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_txn_investment
  ON investment_transactions(investment_id);
