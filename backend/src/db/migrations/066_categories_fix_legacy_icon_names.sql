-- The very first schema (001_initial_schema.sql) seeded 12 global default
-- categories (user_id IS NULL, is_default = true) with Lucide icon NAME
-- strings ('utensils', 'plane', 'zap', ...) instead of emoji. A later
-- version switched to per-user emoji-seeded categories (DEFAULT_CATEGORIES
-- in auth.js) for new accounts, but nothing ever migrated these original
-- global rows -- accounts that predate that switch still reference them.
-- Every UI surface except TransactionModal's CategoryIcon component renders
-- categories.icon as a raw string, so those accounts see literal text like
-- "utensils" instead of an icon. Scoped tightly to (user_id IS NULL AND
-- is_default = true) so this can never touch a user's own custom category.
UPDATE categories SET icon = '🍽️' WHERE user_id IS NULL AND is_default = true AND icon = 'utensils';
UPDATE categories SET icon = '🏠'  WHERE user_id IS NULL AND is_default = true AND icon = 'home';
UPDATE categories SET icon = '🚗'  WHERE user_id IS NULL AND is_default = true AND icon = 'car';
UPDATE categories SET icon = '🛍️' WHERE user_id IS NULL AND is_default = true AND icon = 'shopping-bag';
UPDATE categories SET icon = '📱'  WHERE user_id IS NULL AND is_default = true AND icon = 'repeat';
UPDATE categories SET icon = '⚡'  WHERE user_id IS NULL AND is_default = true AND icon = 'zap';
UPDATE categories SET icon = '✈️'  WHERE user_id IS NULL AND is_default = true AND icon = 'plane';
UPDATE categories SET icon = '🏥'  WHERE user_id IS NULL AND is_default = true AND icon = 'heart-pulse';
UPDATE categories SET icon = '📈'  WHERE user_id IS NULL AND is_default = true AND icon = 'trending-up';
UPDATE categories SET icon = '💰'  WHERE user_id IS NULL AND is_default = true AND icon = 'briefcase';
UPDATE categories SET icon = '💻'  WHERE user_id IS NULL AND is_default = true AND icon = 'laptop';
UPDATE categories SET icon = '📦'  WHERE user_id IS NULL AND is_default = true AND icon = 'circle-dot';
