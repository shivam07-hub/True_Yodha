-- Migration: user_feedback table
-- Apply in Supabase SQL Editor

CREATE TABLE user_feedback (
  id         SERIAL       PRIMARY KEY,
  user_id    UUID         REFERENCES user_profiles(id) ON DELETE SET NULL,
  type       VARCHAR(20)  NOT NULL CHECK (type IN ('feedback', 'company', 'bug')),
  payload    JSONB        NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_feedback_user    ON user_feedback(user_id);
CREATE INDEX idx_feedback_type    ON user_feedback(type);
CREATE INDEX idx_feedback_created ON user_feedback(created_at DESC);

ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own rows
CREATE POLICY "own feedback insert"
  ON user_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Users can read their own feedback
CREATE POLICY "own feedback read"
  ON user_feedback FOR SELECT
  USING (auth.uid() = user_id);
