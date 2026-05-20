-- Migration: Feedback Hub redesign
-- Extends user_feedback to support the unified Feedback Hub (Backlog #17).
-- Adds idea/question/praise categories + status lifecycle for "My reports" tab.
--
-- Apply in Supabase SQL Editor.

-- 1. Extend the type CHECK to include the new categories.
ALTER TABLE user_feedback
  DROP CONSTRAINT IF EXISTS user_feedback_type_check;

ALTER TABLE user_feedback
  ADD CONSTRAINT user_feedback_type_check
  CHECK (type IN ('feedback', 'company', 'bug', 'idea', 'question', 'praise'));

-- 2. Add a status column for the My-reports lifecycle.
ALTER TABLE user_feedback
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'received'
  CHECK (status IN ('received', 'triaged', 'in_progress', 'shipped', 'closed'));

CREATE INDEX IF NOT EXISTS idx_feedback_status ON user_feedback(status);

-- 3. Tell PostgREST to refresh its schema cache so the column shows up immediately.
NOTIFY pgrst, 'reload schema';
