-- Migration 006: Life Events Planning
-- Adds event_type and ai_plan columns to savings_goals table

ALTER TABLE savings_goals
ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_plan JSONB DEFAULT NULL;
