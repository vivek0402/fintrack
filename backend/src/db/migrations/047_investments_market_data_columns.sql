ALTER TABLE investments ADD COLUMN IF NOT EXISTS scheme_code TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS last_price_updated_at TIMESTAMPTZ;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS price_source TEXT NOT NULL DEFAULT 'manual' CHECK (price_source IN ('manual', 'mfapi'));

CREATE INDEX IF NOT EXISTS idx_investments_scheme_code
  ON investments(scheme_code) WHERE scheme_code IS NOT NULL;
