ALTER TABLE financial_plan_expenses
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_plan_expenses_category
  ON financial_plan_expenses(category_id) WHERE category_id IS NOT NULL;
