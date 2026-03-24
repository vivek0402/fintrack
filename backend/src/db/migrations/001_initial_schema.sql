CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  currency      VARCHAR(10) DEFAULT 'INR',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  icon       VARCHAR(50),
  color      VARCHAR(7),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  type        VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  amount      DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  description VARCHAR(255) NOT NULL,
  notes       TEXT,
  tags        TEXT[],
  date        DATE NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budgets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount      DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year        INTEGER NOT NULL CHECK (year >= 2000),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, category_id, month, year)
);

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  type          VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  amount        DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  description   VARCHAR(255) NOT NULL,
  notes         TEXT,
  frequency     VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_month  INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
  next_due_date DATE NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS savings_goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  target_amount DECIMAL(12,2) NOT NULL CHECK (target_amount > 0),
  saved_amount  DECIMAL(12,2) DEFAULT 0 CHECK (saved_amount >= 0),
  deadline      DATE,
  color         VARCHAR(7) DEFAULT '#10b981',
  icon          VARCHAR(50) DEFAULT 'target',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_user_id ON recurring_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON savings_goals(user_id);

INSERT INTO categories (name, icon, color, is_default) VALUES
  ('Food',          'utensils',     '#FF6B6B', true),
  ('Rent',          'home',         '#4ECDC4', true),
  ('Transport',     'car',          '#45B7D1', true),
  ('Shopping',      'shopping-bag', '#96CEB4', true),
  ('Subscriptions', 'repeat',       '#FFEAA7', true),
  ('Utilities',     'zap',          '#DDA0DD', true),
  ('Travel',        'plane',        '#98D8C8', true),
  ('Health',        'heart-pulse',  '#F7DC6F', true),
  ('Investments',   'trending-up',  '#82E0AA', true),
  ('Salary',        'briefcase',    '#85C1E9', true),
  ('Freelance',     'laptop',       '#F1948A', true),
  ('Other',         'circle-dot',   '#BDC3C7', true);