ALTER TABLE agent_conversations DROP CONSTRAINT IF EXISTS agent_conversations_agent_type_check;
ALTER TABLE agent_conversations ADD CONSTRAINT agent_conversations_agent_type_check
  CHECK (agent_type IN ('debt_coach','investment_advisor','tax_planner','budget_master','general'));
