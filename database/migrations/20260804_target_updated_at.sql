-- When the user last changed their direction (roles / seniority / locations).
--
-- The system had no record of this, so nothing could reason about whether a
-- match run was merely late or actually lost. That gap is what made the
-- onboarding shortlist show cards from the PREVIOUS direction as clickable:
-- the read had no way to say "a run for this direction hasn't landed yet", so
-- it fell back to the durable stack and the user got a 409 on a role they were
-- looking at.
--
-- Paired with `user_profiles.last_match_run_at` (stamped only by
-- match_run.run_match on completion) this becomes a complete, honest answer:
--
--   last_match_run_at >= target_updated_at  -> the matches reflect this direction
--   otherwise                               -> a run is outstanding; bounded by a
--                                              grace window, then self-healed
--
-- Additive and reversible. Backfilled to `created_at`: every existing row's
-- direction predates its last run by definition, so an old timestamp reads as
-- "not outstanding", which is the truth for them.
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS target_updated_at TIMESTAMPTZ;

UPDATE user_profiles
SET target_updated_at = created_at
WHERE target_updated_at IS NULL;

COMMENT ON COLUMN user_profiles.target_updated_at IS
    'Last direction change (target roles/seniority/locations). Compared against '
    'last_match_run_at to tell an outstanding match run from a completed one. '
    'Written by UsersRepository.update_profile whenever a target_* key is set.';

NOTIFY pgrst, 'reload schema';
