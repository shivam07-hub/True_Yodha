-- Story identity — atomic fold and undo (2026-09-12).
--
-- Companion to 20260912100000_story_identity.sql. The PLAN (which phrasings
-- move, which archive, what the survivor's metrics/skills/provenance become)
-- is computed and unit-tested in app/services/story_identity_rules.py. These
-- functions only APPLY it, in one transaction, so a fold can never land half
-- way with no record to undo it from.
--
-- The guards ARE the invariants, stated where they cannot be raced:
--   · a user ruling is law — no rule/judge fold over a pair the user decided
--   · only an ACTIVE duplicate folds, only into an ACTIVE survivor
--   · only a RECORDED fold can be undone, and only while its survivor is active
--
-- moved (on the verdict row) = {
--   "dup_id":            uuid,
--   "moved_pointers":    [{"id": uuid, "was_canonical": bool}],
--   "archived_pointers": [uuid],   -- the duplicate's phrasings already on the survivor
--   "dup_added":         {"metrics": [...], "skills": [...], "inflow_ids": [...]}
-- }
-- dup_added is what the fold ADDED to the survivor, so undo removes exactly
-- that even when later folds have landed on the same survivor.
--
-- SECURITY INVOKER: the user client runs these under RLS (own rows only); the
-- worker's admin client is scoped by p_user_id on every statement.
--
-- Apply on Supabase, then: NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE OR REPLACE FUNCTION story_identity_fold(
  p_user_id          uuid,
  p_keep             uuid,
  p_dup              uuid,
  p_verdict          text,
  p_decided_by       text,
  p_move_pointers    uuid[],
  p_archive_pointers uuid[],
  p_keep_metrics     jsonb,
  p_keep_skills      text[],
  p_keep_inflows     uuid[],
  p_moved            jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_verdict NOT IN ('auto_folded', 'merged') THEN
    RAISE EXCEPTION 'story_identity_fold: % is not a fold verdict', p_verdict;
  END IF;

  IF p_decided_by <> 'user' AND EXISTS (
    SELECT 1 FROM story_merge_verdicts
     WHERE user_id = p_user_id
       AND story_a = LEAST(p_keep, p_dup) AND story_b = GREATEST(p_keep, p_dup)
       AND decided_by = 'user'
  ) THEN
    RAISE EXCEPTION 'story_identity_fold: the user already ruled on this pair';
  END IF;

  UPDATE career_stories SET status = 'archived', updated_at = now()
   WHERE user_id = p_user_id AND id = p_dup AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_identity_fold: duplicate % is not an active story', p_dup;
  END IF;

  UPDATE career_stories
     SET metrics = p_keep_metrics, skills = p_keep_skills,
         inflow_ids = p_keep_inflows, updated_at = now()
   WHERE user_id = p_user_id AND id = p_keep AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_identity_fold: survivor % is not an active story', p_keep;
  END IF;

  UPDATE cv_points
     SET story_id = p_keep, role_anchor = 'story:' || p_keep::text,
         is_canonical = false, updated_at = now()
   WHERE user_id = p_user_id AND story_id = p_dup AND id = ANY (p_move_pointers);

  UPDATE cv_points SET status = 'archived', updated_at = now()
   WHERE user_id = p_user_id AND story_id = p_dup AND id = ANY (p_archive_pointers);

  INSERT INTO story_merge_verdicts (user_id, story_a, story_b, verdict, decided_by, keep_id, moved)
  VALUES (p_user_id, LEAST(p_keep, p_dup), GREATEST(p_keep, p_dup),
          p_verdict, p_decided_by, p_keep, p_moved)
  ON CONFLICT (user_id, story_a, story_b) DO UPDATE
     SET verdict = EXCLUDED.verdict, decided_by = EXCLUDED.decided_by,
         keep_id = EXCLUDED.keep_id, moved = EXCLUDED.moved, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION story_identity_unfold(
  p_user_id        uuid,
  p_keep           uuid,
  p_dup            uuid,
  p_back_canonical uuid[],
  p_back_variant   uuid[],
  p_reactivate     uuid[],
  p_keep_metrics   jsonb,
  p_keep_skills    text[],
  p_keep_inflows   uuid[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE story_merge_verdicts
     SET verdict = 'keep_separate', decided_by = 'user',
         keep_id = NULL, moved = NULL, updated_at = now()
   WHERE user_id = p_user_id
     AND story_a = LEAST(p_keep, p_dup) AND story_b = GREATEST(p_keep, p_dup)
     AND verdict IN ('auto_folded', 'merged') AND keep_id = p_keep;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_identity_unfold: no recorded fold of % into %', p_dup, p_keep;
  END IF;

  UPDATE career_stories
     SET metrics = p_keep_metrics, skills = p_keep_skills,
         inflow_ids = p_keep_inflows, updated_at = now()
   WHERE user_id = p_user_id AND id = p_keep AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_identity_unfold: survivor % was merged away since — undo that first', p_keep;
  END IF;

  UPDATE career_stories SET status = 'active', updated_at = now()
   WHERE user_id = p_user_id AND id = p_dup AND status = 'archived';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_identity_unfold: % is not an archived story', p_dup;
  END IF;

  UPDATE cv_points
     SET story_id = p_dup, role_anchor = 'story:' || p_dup::text,
         is_canonical = true, updated_at = now()
   WHERE user_id = p_user_id AND story_id = p_keep AND id = ANY (p_back_canonical);

  UPDATE cv_points
     SET story_id = p_dup, role_anchor = 'story:' || p_dup::text,
         is_canonical = false, updated_at = now()
   WHERE user_id = p_user_id AND story_id = p_keep AND id = ANY (p_back_variant);

  UPDATE cv_points SET status = 'active', updated_at = now()
   WHERE user_id = p_user_id AND story_id = p_dup AND id = ANY (p_reactivate);
END;
$$;

-- Stable order for paging: the application reads these pairs in 1,000-row
-- pages (PostgREST truncates silently past that), so ties must break the same
-- way on every page.
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
  ORDER BY 3 DESC, 1, 2;
$$;

COMMIT;
