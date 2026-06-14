CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_bank_balance NUMERIC(15,2) DEFAULT 0,
  total_investments NUMERIC(15,2) DEFAULT 0,
  total_assets NUMERIC(15,2) DEFAULT 0,
  total_credit_outstanding NUMERIC(15,2) DEFAULT 0,
  total_loans_outstanding NUMERIC(15,2) DEFAULT 0,
  total_liabilities NUMERIC(15,2) DEFAULT 0,
  net_worth NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_nw_snapshots_user
  ON net_worth_snapshots(user_id, snapshot_date DESC);
