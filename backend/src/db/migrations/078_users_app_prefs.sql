-- Small per-user app choices that should follow the user across devices
-- (previously only in each device's localStorage):
--   cc_not_paid:     { "<cardId>": ["YYYY-MM-DD", ...] }  statements the user
--                    said really weren't paid (card payment nudges skip them)
--   account_memory:  { "byDesc": {...}, "byMethod": {...} }  which bank
--                    account they used per description / payment method
-- NULL = nothing saved yet.
ALTER TABLE users ADD COLUMN IF NOT EXISTS app_prefs JSONB;
