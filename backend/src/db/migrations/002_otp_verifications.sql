-- Add email verification flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- Mark existing users as verified so the old login flow is not broken
UPDATE users SET is_verified = true WHERE is_verified IS NULL OR is_verified = false;

-- OTP storage table
CREATE TABLE IF NOT EXISTS otp_verifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      VARCHAR(255) NOT NULL,
  otp        CHAR(6) NOT NULL,
  type       VARCHAR(20) NOT NULL CHECK (type IN ('register', 'reset_password')),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otp_email_type ON otp_verifications(email, type);
