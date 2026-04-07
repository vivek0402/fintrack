-- Performance indexes for high-frequency query patterns
-- These are critical for query performance as transaction count grows

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
    ON transactions(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_month
    ON transactions(user_id, EXTRACT(MONTH FROM date), EXTRACT(YEAR FROM date));

CREATE INDEX IF NOT EXISTS idx_budgets_user_month
    ON budgets(user_id, month, year);

CREATE INDEX IF NOT EXISTS idx_categories_user
    ON categories(user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_user_type
    ON transactions(user_id, type);

CREATE INDEX IF NOT EXISTS idx_recurring_user_active
    ON recurring_transactions(user_id, is_active);
