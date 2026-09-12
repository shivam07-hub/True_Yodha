-- Story identity — one achievement is one Career Story (2026-09-12).
--
-- Companion to role_merge_verdicts (#38): the same ruling ledger, for stories.
-- One row = one (user, story pair) ruling:
--   auto_folded   = same work said differently (near-verbatim rule or the
--                   judge); folded, shown under "Merged for you", undoable
--   proposed      = the judge saw one as PART OF the other, or was unsure —
--                   the user rules on it in the Stories review space
--   merged        = the user merged a proposed pair
--   keep_separate = the judge ruled different, or the user kept both, or the
--                   user undid a fold
-- A USER ruling is law: a decided pair is never judged again. Pairs are stored
-- normalized (story_a < story_b) so each pair has exactly one row.
--
-- keep_id + moved record what a fold did, so it can be undone exactly. The
-- shape of moved is documented in 20260912100100_story_identity_fold.sql.
--
-- story_identity_pairs: pgvector pairwise similarity for one user's active
-- stories, floored. Cosine only NOMINATES candidates — the rules in
-- app/services/story_identity.py decide which pairs are judged. SECURITY
-- INVOKER: under the user client RLS scopes it to their own rows; the worker's
-- admin client is scoped by p_user_id.
--
-- Apply on Supabase, then: NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE TABLE IF NOT EXISTS story_merge_verdicts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- No FK: stories archive rather than delete, and a verdict must outlive both.
  story_a    uuid NOT NULL,
  story_b    uuid NOT NULL,
  verdict    text NOT NULL CHECK (verdict IN ('proposed', 'auto_folded', 'merged', 'keep_separate')),
  decided_by text NOT NULL DEFAULT 'judge' CHECK (decided_by IN ('rule', 'judge', 'user')),
  keep_id    uuid,
  moved      jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (story_a < story_b),
  -- A fold always records its survivor; nothing else carries one.
  CHECK ((verdict IN ('auto_folded', 'merged')) = (keep_id IS NOT NULL)),
  UNIQUE (user_id, story_a, story_b)
);

CREATE INDEX IF NOT EXISTS idx_story_merge_verdicts_user
  ON story_merge_verdicts (user_id, verdict);

ALTER TABLE story_merge_verdicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS story_merge_verdicts_own ON story_merge_verdicts;
CREATE POLICY story_merge_verdicts_own ON story_merge_verdicts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION story_identity_pairs(
  p_user_id uuid,
  p_floor   float DEFAULT 0.60
)
RETURNS TABLE (story_a uuid, story_b uuid, similarity float)
LANGUAGE sql
STABLE
AS $$
  SELECT a.id, b.id, 1 - (a.embedding <=> b.embedding)
  FROM career_stories a
  JOIN career_stories b
    ON b.user_id = a.user_id
   AND a.id < b.id
  WHERE a.user_id = p_user_id
    AND a.status = 'active' AND b.status = 'active'
    AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
    AND 1 - (a.embedding <=> b.embedding) >= p_floor
  ORDER BY 3 DESC;
$$;

COMMIT;
