-- Tracks how many times a user has appealed (manually corrected) a skill level.
-- Capped at 2 per skill. After 2 appeals the endpoint returns 422.
ALTER TABLE user_skills
  ADD COLUMN IF NOT EXISTS correction_count INTEGER NOT NULL DEFAULT 0;
