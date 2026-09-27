-- Android home-screen widgets authenticate with a long-lived, widget-scoped
-- JWT (see utils/widgetToken.js). Each token carries the user's current
-- widget_token_version as its `ver` claim; POST /api/widget/revoke bumps the
-- version, which invalidates every widget token issued before it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS widget_token_version INT NOT NULL DEFAULT 0;
