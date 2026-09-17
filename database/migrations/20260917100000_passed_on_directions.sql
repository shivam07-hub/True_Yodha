-- What Myro learned from your skips, and the way back.
--
-- `matching/passed_on` counts "Not my role" across a user's skips and stops the
-- pick gate choosing directions they rejected twice. Two columns make that
-- visible and reversible:
--
-- `passed_on_directions` is a SNAPSHOT for the surface, written when the pick
-- set is cut. The rule stays in one module and the evidence stays in
-- job_feedback_events; this is only so the band can name what it stopped
-- picking without re-deriving it on a read the user waits for.
--
-- `passed_on_cleared_at` is the way back. Skips before that instant stop
-- counting, so "show these again" costs the user nothing and deletes none of
-- what they told us. A destructive undo (deleting the feedback rows) would lose
-- the evidence and leave the next count wrong.
alter table public.user_profiles
  add column if not exists passed_on_directions text[] not null default array[]::text[];

alter table public.user_profiles
  add column if not exists passed_on_cleared_at timestamptz;

comment on column public.user_profiles.passed_on_directions is
  'Directions this user rejected twice, as computed by matching/passed_on when their pick set was last cut. A snapshot for the surface to read, never the source: the rule lives in one module and the evidence is job_feedback_events.';

comment on column public.user_profiles.passed_on_cleared_at is
  'When the user asked to see those directions again. Skips before this instant stop counting, so the decision is reversible without deleting the evidence they gave.';

notify pgrst, 'reload schema';
