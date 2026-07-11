-- Skill upvotes — the per-job "I want to learn this" signal (CV-funnel lane).
-- One row = one upvote of a skill from one job's detail drawer, so a user's
-- count for a skill literally reads "N of my jobs need this". Feeds Forge
-- practice ordering. Toggleable (delete on un-upvote), own-only RLS.
--
-- Apply on Supabase, then: NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE TABLE IF NOT EXISTS skill_upvotes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_key    text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  -- No FK: jobs delist/age out, the learning intent stays.
  job_id       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, skill_key, job_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_upvotes_user_skill
  ON skill_upvotes (user_id, skill_key);

ALTER TABLE skill_upvotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS skill_upvotes_own ON skill_upvotes;
CREATE POLICY skill_upvotes_own ON skill_upvotes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
