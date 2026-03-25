-- Migration 004: Regret Score
-- Adds is_regretted flag to transactions table

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS is_regretted BOOLEAN DEFAULT false;
