-- 20260623_match_missing_skills.sql
-- T3-1 (beta feedback): job cards must explain a low/0 fit by naming the skills
-- the user is MISSING, not just the ones matched. The matcher already knows the
-- job's full required-skill set, so it can emit the un-matched remainder. Persist
-- it alongside matched_skills (same shape/contract) so the read seam (MatchEval →
-- to_job_match) surfaces it with zero extra query.
--
-- Additive + idempotent. NOT NULL DEFAULT '[]' mirrors matched_skills exactly, so
-- existing rows backfill to an empty list and the read never narrows. New rows get
-- the real list on the next match recompute (CV upload / weekly batch).
ALTER TABLE user_job_matches
    ADD COLUMN IF NOT EXISTS missing_skills jsonb NOT NULL DEFAULT '[]'::jsonb;

-- PostgREST: reload schema cache so the new column is selectable immediately.
NOTIFY pgrst, 'reload schema';
