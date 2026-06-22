ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_investment_category BOOLEAN NOT NULL DEFAULT false;

UPDATE categories SET is_investment_category = true WHERE name = 'Investments' AND is_investment_category = false;

CREATE INDEX IF NOT EXISTS idx_categories_investment_flag
  ON categories(user_id, is_investment_category) WHERE is_investment_category = true;
