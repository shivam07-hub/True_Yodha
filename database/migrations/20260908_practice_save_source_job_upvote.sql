-- 20260908 — `job_upvote` is a real practice-save source, and has been since
-- the skill-upvote toggle shipped.
--
-- `POST /users/me/skill-upvotes/toggle` writes a practice save with
-- source='job_upvote' (app/routers/users.py:292). The CHECK never learned the
-- value, so every upvote that created a save raised a PostgREST APIError and
-- the route 500'd. Widening only — no existing row can violate it.

ALTER TABLE public.practice_saves
    DROP CONSTRAINT IF EXISTS practice_saves_source_check;

ALTER TABLE public.practice_saves
    ADD CONSTRAINT practice_saves_source_check
    CHECK (source IN ('gap_session', 'market', 'skills', 'job_detail',
                      'manual', 'other', 'job_upvote'));
