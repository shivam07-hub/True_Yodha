-- 20260518_linkedin_profile_xp.sql
-- One-time XP reward when a user adds a LinkedIn profile.

BEGIN;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS linkedin_xp_granted BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE user_profiles
SET linkedin_xp_granted = TRUE
WHERE NULLIF(TRIM(COALESCE(linkedin_url, '')), '') IS NOT NULL;

COMMIT;
