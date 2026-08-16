-- Migration 066 fixed the 12 legacy Lucide-icon-name values ('utensils',
-- 'plane', 'zap', ...) left over from 001_initial_schema.sql's original seed,
-- but scoped to (user_id IS NULL AND is_default = true) only. A real account
-- was found post-deploy still showing literal "utensils" text, meaning at
-- least one of these legacy rows exists outside that scope (e.g. a per-user
-- copy predating the switch to auth.js's emoji-seeded DEFAULT_CATEGORIES).
-- Same 12 statements as 066, but matching on the known-bad icon VALUE alone
-- -- still narrow and idempotent (exact-value match), just not restricted to
-- ownership, so it also reaches any user-owned row carrying the same legacy
-- string.
UPDATE categories SET icon = '🍽️' WHERE icon = 'utensils';
UPDATE categories SET icon = '🏠'  WHERE icon = 'home';
UPDATE categories SET icon = '🚗'  WHERE icon = 'car';
UPDATE categories SET icon = '🛍️' WHERE icon = 'shopping-bag';
UPDATE categories SET icon = '📱'  WHERE icon = 'repeat';
UPDATE categories SET icon = '⚡'  WHERE icon = 'zap';
UPDATE categories SET icon = '✈️'  WHERE icon = 'plane';
UPDATE categories SET icon = '🏥'  WHERE icon = 'heart-pulse';
UPDATE categories SET icon = '📈'  WHERE icon = 'trending-up';
UPDATE categories SET icon = '💰'  WHERE icon = 'briefcase';
UPDATE categories SET icon = '💻'  WHERE icon = 'laptop';
UPDATE categories SET icon = '📦'  WHERE icon = 'circle-dot';
