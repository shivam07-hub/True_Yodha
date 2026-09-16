-- A pick records how it graded against the direction it was cut for.
--
-- ADR-0022: fit is graded from skills, never read off a bucket. `direction_fit`
-- grades job-to-direction; this is where the pick gate's answer is kept, so the
-- card can say "on direction" or "pivot" without regrading, and so the band's
-- own history stays readable.
--
-- Stored, not derived. A pick set is a record of what Myro recommended and why;
-- regrading an old set against a direction the user has since changed would
-- rewrite that record. NULL means the set was cut before this column existed,
-- which reads as `unknown` — the honest answer for a pick nobody graded, and the
-- reason the card shows no tag rather than a wrong one.
alter table public.user_agent_job_picks
  add column if not exists direction text;

alter table public.user_agent_job_picks
  drop constraint if exists user_agent_job_picks_direction_check;

alter table public.user_agent_job_picks
  add constraint user_agent_job_picks_direction_check
  check (direction is null or direction in ('on_direction', 'off_direction', 'unknown'));

comment on column public.user_agent_job_picks.direction is
  'How this pick graded against the user''s direction when it was cut (matching/direction_fit): on_direction | off_direction | unknown. NULL on rows written before 20260916.';

notify pgrst, 'reload schema';
