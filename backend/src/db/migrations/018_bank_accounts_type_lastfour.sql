ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'Savings';
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS last_four    CHAR(4);
