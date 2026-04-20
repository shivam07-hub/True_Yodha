-- 20260418_cv_history.sql
-- Store CV raw text on user profile and track per-upload history for progress view.

BEGIN;

ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS cv_raw_text TEXT;

CREATE TABLE IF NOT EXISTS cv_history (
    id             SERIAL       PRIMARY KEY,
    user_id        UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    skills_count   INTEGER      NOT NULL DEFAULT 0,
    mirror_score   DECIMAL(5,2) NOT NULL DEFAULT 0,
    uploaded_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cv_history_user
    ON cv_history(user_id, uploaded_at DESC);

ALTER TABLE cv_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cv history" ON cv_history FOR ALL USING (auth.uid() = user_id);

COMMIT;
