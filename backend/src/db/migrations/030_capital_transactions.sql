CREATE TABLE IF NOT EXISTS capital_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_name TEXT NOT NULL,
  asset_type VARCHAR(20) NOT NULL CHECK (asset_type IN (
    'equity','debt','gold','real_estate','other'
  )),
  transaction_type VARCHAR(4) NOT NULL CHECK (transaction_type IN ('buy','sell')),
  units NUMERIC(20,6) NOT NULL CHECK (units > 0),
  price_per_unit NUMERIC(15,2) NOT NULL CHECK (price_per_unit >= 0),
  transaction_date DATE NOT NULL,
  financial_year VARCHAR(7) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_txn_user_fy
  ON capital_transactions(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_capital_txn_asset
  ON capital_transactions(user_id, asset_name, transaction_date);
