-- Migration 005: AI Chat Memory
-- Stores a rolling summary of each user's chat sessions

CREATE TABLE IF NOT EXISTS ai_chat_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    summary TEXT NOT NULL DEFAULT '',
    message_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_memory_user ON ai_chat_memory(user_id);
