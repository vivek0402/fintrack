CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type VARCHAR(25) NOT NULL CHECK (type IN (
    'form_16','itr_copy','salary_slip','bank_statement','insurance_policy',
    'investment_proof','advance_tax_challan','rent_receipt','other'
  )),
  financial_year VARCHAR(7),
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_fy
  ON documents(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_documents_user_type
  ON documents(user_id, type);
CREATE INDEX IF NOT EXISTS idx_documents_user_created
  ON documents(user_id, created_at DESC);
