CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN (
    'idle_cash','credit_card_interest','high_interest_loan','tax_80c_gap',
    'spending_spike','allocation_gap','sip_underinvesting','emergency_fund_low'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_saved NUMERIC(12,2),
  priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 3),
  action_label TEXT NOT NULL,
  action_route TEXT,
  status VARCHAR(15) NOT NULL DEFAULT 'active' CHECK (status IN ('active','dismissed','acted_on')),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  acted_on_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_opportunities_user_status_priority
  ON opportunities(user_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_opportunities_user_detected
  ON opportunities(user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_user_type
  ON opportunities(user_id, type);
