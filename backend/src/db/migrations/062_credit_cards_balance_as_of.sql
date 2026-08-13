-- outstanding_balance is reinterpreted as a baseline snapshot as of this date
-- (mirrors bank_accounts.starting_balance / balance_as_of) -- current balance is
-- computed by adding linked transaction activity since this date.
ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS balance_as_of DATE DEFAULT NULL;
