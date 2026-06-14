CREATE TABLE IF NOT EXISTS cams_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending','processing','review','imported','failed')),
  folios_extracted INTEGER DEFAULT 0,
  holdings_imported INTEGER DEFAULT 0,
  error_message TEXT,
  extracted_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cams_jobs_user
  ON cams_import_jobs(user_id, created_at DESC);
