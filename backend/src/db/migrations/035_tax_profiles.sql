CREATE TABLE IF NOT EXISTS tax_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  financial_year VARCHAR(7) NOT NULL,
  employer_name TEXT,
  basic_salary_monthly NUMERIC(12,2) NOT NULL CHECK (basic_salary_monthly >= 0),
  hra_component_monthly NUMERIC(12,2) DEFAULT 0,
  lta_component_annual NUMERIC(12,2) DEFAULT 0,
  special_allowance_monthly NUMERIC(12,2) DEFAULT 0,
  rent_paid_monthly NUMERIC(12,2) DEFAULT 0,
  city_type VARCHAR(10) NOT NULL DEFAULT 'non_metro' CHECK (city_type IN (
    'metro','non_metro'
  )),
  lta_claims_used_in_block INTEGER NOT NULL DEFAULT 0 CHECK (lta_claims_used_in_block BETWEEN 0 AND 2),
  preferred_regime VARCHAR(11) NOT NULL DEFAULT 'not_decided' CHECK (preferred_regime IN (
    'old','new','not_decided'
  )),
  itr_checklist_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, financial_year)
);

CREATE INDEX IF NOT EXISTS idx_tax_profiles_user_fy
  ON tax_profiles(user_id, financial_year);
