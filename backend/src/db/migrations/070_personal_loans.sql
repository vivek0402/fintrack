CREATE TABLE IF NOT EXISTS personal_loans (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction         VARCHAR(10) NOT NULL CHECK (direction IN ('lent', 'borrowed')),
    counterparty_name TEXT NOT NULL,
    principal_amount  NUMERIC(12,2) NOT NULL CHECK (principal_amount > 0),
    account_id        INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
    date_given        DATE NOT NULL,
    due_date          DATE,
    interest_type     VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (interest_type IN ('none', 'flat', 'percent_per_month')),
    interest_rate     NUMERIC(6,3),
    notes             TEXT,
    written_off_at    TIMESTAMPTZ,
    transaction_id    UUID REFERENCES transactions(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_loans_user ON personal_loans(user_id);

CREATE TABLE IF NOT EXISTS personal_loan_repayments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id        UUID NOT NULL REFERENCES personal_loans(id) ON DELETE CASCADE,
    amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    date           DATE NOT NULL,
    notes          TEXT,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_loan_repayments_loan ON personal_loan_repayments(loan_id);
