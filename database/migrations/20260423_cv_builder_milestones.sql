-- 20260423_cv_builder_milestones.sql
-- Persist 7-day milestone evidence and store generated CV drafts as separate versions.

BEGIN;

ALTER TABLE cv_history
    ADD COLUMN IF NOT EXISTS cv_raw_text TEXT,
    ADD COLUMN IF NOT EXISTS version_number INTEGER,
    ADD COLUMN IF NOT EXISTS version_type VARCHAR(30) NOT NULL DEFAULT 'baseline_upload',
    ADD COLUMN IF NOT EXISTS title VARCHAR(200),
    ADD COLUMN IF NOT EXISTS evidence_snapshot JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS evidence_count INTEGER NOT NULL DEFAULT 0;

WITH numbered AS (
    SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY uploaded_at ASC, id ASC) AS rn
    FROM cv_history
)
UPDATE cv_history AS h
SET version_number = numbered.rn
FROM numbered
WHERE h.id = numbered.id
  AND h.version_number IS NULL;

ALTER TABLE cv_history
    ALTER COLUMN version_number SET DEFAULT 1,
    ALTER COLUMN version_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_history_user_version
    ON cv_history(user_id, version_number);

CREATE INDEX IF NOT EXISTS idx_cv_history_version
    ON cv_history(user_id, version_number DESC);

CREATE TABLE IF NOT EXISTS user_milestones (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    milestone_date DATE         NOT NULL,
    skill          VARCHAR(200),
    task           TEXT         NOT NULL,
    proof          TEXT,
    impact         TEXT,
    confidence     DECIMAL(3,2) NOT NULL DEFAULT 0.60 CHECK (confidence BETWEEN 0 AND 1),
    completed_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(user_id, milestone_date)
);

CREATE INDEX IF NOT EXISTS idx_milestones_user
    ON user_milestones(user_id, milestone_date DESC);

CREATE INDEX IF NOT EXISTS idx_milestones_completed
    ON user_milestones(user_id, completed_at DESC)
    WHERE completed_at IS NOT NULL;

ALTER TABLE user_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own milestones" ON user_milestones;
CREATE POLICY "own milestones" ON user_milestones FOR ALL USING (auth.uid() = user_id);

COMMIT;
