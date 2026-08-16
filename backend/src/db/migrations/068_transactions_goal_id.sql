-- Optional link from a transaction to the savings goal it contributed to.
-- Lets logging a transaction (e.g. "Transfer to Emergency Fund") also move
-- the goal's saved_amount, instead of requiring a separate manual
-- "Add Funds" action with nothing keeping the two numbers in sync.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES savings_goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_goal_id ON transactions(goal_id) WHERE goal_id IS NOT NULL;
