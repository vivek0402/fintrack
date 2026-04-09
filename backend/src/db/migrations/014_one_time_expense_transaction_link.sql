-- Link one_time_expense_items to transactions so bank balance is computed correctly
ALTER TABLE one_time_expense_items ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;
