ALTER TABLE transactions ADD COLUMN IF NOT EXISTS personal_loan_id UUID REFERENCES personal_loans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_personal_loan_id ON transactions(personal_loan_id) WHERE personal_loan_id IS NOT NULL;
