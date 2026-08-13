-- For redisplay in the edit form only -- the actual balance math flows through
-- the item's linked row in transactions (transaction_id), which carries its own
-- credit_card_id.
ALTER TABLE one_time_expense_items ADD COLUMN IF NOT EXISTS credit_card_id INTEGER REFERENCES credit_cards(id) ON DELETE SET NULL;
