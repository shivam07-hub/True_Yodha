-- Rehearsal belongs to the user, not to the job.
--
-- Myro is one platform: the user is upskilling, and a job is the occasion for
-- the preparation, never its unit. Rehearsing "the Kotak 811 relaunch" out loud
-- is a thing the PERSON did. It does not become un-done because the next room
-- is at 3M instead of Sanofi.
--
-- Step 3 stored a set of requirement STRINGS under `job_deepenings`, keyed by
-- job. So the same story rehearsed in seven rooms counted seven times from
-- zero, and the rail's own headline — "Clear a step once and it counts wherever
-- it applies" — was false for that step by construction.
--
-- The join already exists: every room's cached coverage row carries the
-- `story_id` that answers each requirement. Marking the STORY makes the carry
-- automatic, with no extra read anywhere.
--
-- Additive and reversible:
--   alter table public.career_stories drop column rehearsed_at;
--   drop function public.prep_user_state();

alter table public.career_stories
  add column if not exists rehearsed_at timestamptz;

comment on column public.career_stories.rehearsed_at is
  'When the user last rehearsed telling this story out loud. User-level by '
  'definition: prep step 3 counts it in every room whose coverage maps a '
  'requirement to this story. NULL = not rehearsed.';

-- One round trip for everything the prep ladder needs about the USER, so the
-- ladder''s read wave stays at three concurrent sections
-- (ARCHITECTURE_READ_PATH.md §2). Adding a fourth section for a read this small
-- would spend a slot of the process-wide budget for the whole wave''s duration.
--
-- SECURITY INVOKER (the default) and no arguments: it reads auth.uid() itself,
-- so it can never be pointed at another user's rows. Same shape as
-- current_user_feed_context().
create or replace function public.prep_user_state()
returns jsonb
language sql
stable
set search_path to ''
as $$
    select jsonb_build_object(
        'skills', coalesce((
            select jsonb_object_agg(lower(btrim(s.taxonomy_key)), us.matched_level)
            from public.user_skills us
            join public.skills s on s.id = us.skill_id
            where us.user_id = auth.uid()
              and nullif(btrim(s.taxonomy_key), '') is not null
              and us.matched_level is not null
        ), '{}'::jsonb),
        'rehearsed', coalesce((
            select jsonb_agg(cs.id)
            from public.career_stories cs
            where cs.user_id = auth.uid()
              and cs.rehearsed_at is not null
        ), '[]'::jsonb)
    );
$$;

comment on function public.prep_user_state() is
  'Everything the prep ladder needs about the user, in one round trip: skill '
  'levels held, and the stories already rehearsed. Invoker + auth.uid().';

grant execute on function public.prep_user_state() to authenticated;
