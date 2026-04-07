-- OTP security hardening: add attempt counter to track brute-force attempts
ALTER TABLE otp_verifications ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
