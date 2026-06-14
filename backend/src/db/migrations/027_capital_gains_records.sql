CREATE TABLE IF NOT EXISTS capital_gains_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  sell_transaction_id UUID NOT NULL REFERENCES investment_transactions(id) ON DELETE CASCADE,
  asset_type VARCHAR(20) NOT NULL CHECK (asset_type IN (
    'mutual_fund','stock','fd','ppf','nps','gold','crypto','other'
  )),
  units NUMERIC(20,6) NOT NULL CHECK (units > 0),
  acquisition_date DATE NOT NULL,
  sale_date DATE NOT NULL,
  cost_basis NUMERIC(15,2) NOT NULL CHECK (cost_basis >= 0),
  sale_value NUMERIC(15,2) NOT NULL CHECK (sale_value >= 0),
  gain_amount NUMERIC(15,2) NOT NULL,
  gain_type VARCHAR(10) NOT NULL CHECK (gain_type IN ('stcg','ltcg')),
  financial_year VARCHAR(9) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cg_records_user_fy
  ON capital_gains_records(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_cg_records_sell_txn
  ON capital_gains_records(sell_transaction_id);
