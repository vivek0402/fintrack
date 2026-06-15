CREATE TABLE IF NOT EXISTS agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_type VARCHAR(25) NOT NULL CHECK (agent_type IN (
    'debt_coach','investment_advisor','tax_planner','budget_master'
  )),
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_user_agent_updated
  ON agent_conversations(user_id, agent_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_user_updated
  ON agent_conversations(user_id, updated_at DESC);
