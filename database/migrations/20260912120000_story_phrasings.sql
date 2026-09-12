-- Story phrasings — promote one, drop one (2026-09-12).
--
-- A Career Story holds every way the user has ever written one achievement
-- (ADR-0021). The phrasing drawer lets them choose which one leads on the CV
-- and drop one that is weak. Two invariants, stated here rather than hoped for
-- in application code:
--
--   · a story always has exactly ONE canonical phrasing among its active ones
--   · a story never loses its last phrasing — archive the story instead
--
-- Archive-not-delete throughout, matching the reservoir's curation policy.
-- SECURITY INVOKER: RLS scopes the user client to their own rows; the worker's
-- admin client is scoped by p_user_id on every statement.
--
-- Apply on Supabase, then: NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE OR REPLACE FUNCTION story_pointer_promote(p_user_id uuid, p_point_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  sid uuid;
BEGIN
  SELECT story_id INTO sid
    FROM cv_points
   WHERE user_id = p_user_id AND id = p_point_id
     AND status = 'active' AND story_id IS NOT NULL;
  IF sid IS NULL THEN
    RAISE EXCEPTION 'story_pointer_promote: % is not an active phrasing of a story', p_point_id;
  END IF;

  UPDATE cv_points SET is_canonical = false, updated_at = now()
   WHERE user_id = p_user_id AND story_id = sid AND id <> p_point_id AND is_canonical;

  UPDATE cv_points SET is_canonical = true, updated_at = now()
   WHERE user_id = p_user_id AND id = p_point_id;
END;
$$;

CREATE OR REPLACE FUNCTION story_pointer_drop(p_user_id uuid, p_point_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  sid       uuid;
  was_canon boolean;
  remaining int;
  next_id   uuid;
BEGIN
  SELECT story_id, is_canonical INTO sid, was_canon
    FROM cv_points
   WHERE user_id = p_user_id AND id = p_point_id
     AND status = 'active' AND story_id IS NOT NULL;
  IF sid IS NULL THEN
    RAISE EXCEPTION 'story_pointer_drop: % is not an active phrasing of a story', p_point_id;
  END IF;

  SELECT count(*) INTO remaining
    FROM cv_points
   WHERE user_id = p_user_id AND story_id = sid AND status = 'active' AND id <> p_point_id;
  IF remaining = 0 THEN
    RAISE EXCEPTION 'story_pointer_drop: a story keeps its last phrasing — archive the story instead';
  END IF;

  UPDATE cv_points SET status = 'archived', is_canonical = false, updated_at = now()
   WHERE user_id = p_user_id AND id = p_point_id;

  IF was_canon THEN
    SELECT id INTO next_id
      FROM cv_points
     WHERE user_id = p_user_id AND story_id = sid AND status = 'active'
     ORDER BY ordering, created_at
     LIMIT 1;
    UPDATE cv_points SET is_canonical = true, updated_at = now()
     WHERE user_id = p_user_id AND id = next_id;
  END IF;
END;
$$;

COMMIT;
