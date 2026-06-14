CREATE TABLE IF NOT EXISTS investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN (
    'mutual_fund','stock','fd','ppf','nps','gold','crypto','other'
  )),
  name TEXT NOT NULL,
  ticker_or_folio TEXT,
  units NUMERIC(20,6) NOT NULL CHECK (units > 0),
  purchase_price_per_unit NUMERIC(15,2) NOT NULL CHECK (purchase_price_per_unit >= 0),
  current_nav_or_price NUMERIC(15,2) NOT NULL CHECK (current_nav_or_price >= 0),
  purchase_date DATE NOT NULL,
  account_label TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investments_user_id
  ON investments(user_id);
CREATE INDEX IF NOT EXISTS idx_investments_user_type
  ON investments(user_id, type);
CREATE INDEX IF NOT EXISTS idx_investments_purchase_date
  ON investments(user_id, purchase_date DESC);
