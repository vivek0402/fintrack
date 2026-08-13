ALTER TABLE transactions ADD COLUMN IF NOT EXISTS credit_card_id INTEGER REFERENCES credit_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_credit_card ON transactions(credit_card_id);
