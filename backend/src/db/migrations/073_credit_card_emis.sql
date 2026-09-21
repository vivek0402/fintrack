CREATE TABLE IF NOT EXISTS credit_card_emis (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credit_card_id         INTEGER NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
    source_transaction_id  UUID REFERENCES transactions(id) ON DELETE SET NULL,
    principal_amount       NUMERIC(12,2) NOT NULL CHECK (principal_amount > 0),
    tenure_months          INTEGER NOT NULL CHECK (tenure_months > 0),
    interest_rate_pct      NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (interest_rate_pct >= 0),
    is_no_cost             BOOLEAN NOT NULL DEFAULT false,
    processing_fee         NUMERIC(12,2) CHECK (processing_fee IS NULL OR processing_fee >= 0),
    markup_suspected       BOOLEAN NOT NULL DEFAULT false,
    notes                  TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_card_emis_user ON credit_card_emis(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_emis_credit_card ON credit_card_emis(credit_card_id);

COMMENT ON COLUMN credit_card_emis.markup_suspected IS
    'Manual user flag ("I think this no-cost EMI price was marked up"). Not set by any automated detection.';

CREATE TABLE IF NOT EXISTS credit_card_emi_installments (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    emi_id               UUID NOT NULL REFERENCES credit_card_emis(id) ON DELETE CASCADE,
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    installment_number   INTEGER NOT NULL CHECK (installment_number > 0),
    due_date             DATE NOT NULL,
    amount               NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    principal_component  NUMERIC(12,2) NOT NULL,
    interest_component   NUMERIC(12,2) NOT NULL DEFAULT 0,
    posted_at            TIMESTAMPTZ,
    transaction_id       UUID REFERENCES transactions(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT credit_card_emi_installments_emi_number_unique UNIQUE (emi_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_credit_card_emi_installments_emi
  ON credit_card_emi_installments(emi_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_emi_installments_user
  ON credit_card_emi_installments(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_emi_installments_due_unposted
  ON credit_card_emi_installments(due_date) WHERE posted_at IS NULL;
