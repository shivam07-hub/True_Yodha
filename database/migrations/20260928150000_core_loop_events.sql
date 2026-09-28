-- The core loop's blind steps, recorded.
--
-- Best job -> tailored CV -> download -> apply. On 2026-09-28 the funnel for
-- the 55 people holding best jobs read 44 shown -> 11 saved -> 6 tailored,
-- and three steps in between left no record at all: opening the job panel,
-- arriving in the CV editor for that job, and downloading the CV. Nobody
-- could say whether people reached the editor and gave up, or never went.
--
-- One row per step taken. `job_id` carries no FK on purpose: a closed listing
-- is unloaded from `jobs`, and the step still happened (same reason
-- `job_recommendation_exposures` has none). Written by the API with the
-- service role only; the vocabulary is tied to `CORE_LOOP_STEPS` in
-- app/routers/telemetry.py and `CoreLoopStep` in lib/api.ts by
-- test_telemetry_vocabulary.py.
--
-- Additive. Reverse: drop table public.core_loop_events;

begin;

create table if not exists public.core_loop_events (
    id           bigint generated always as identity primary key,
    user_id      uuid not null references auth.users(id) on delete cascade,
    job_id       text not null,
    step         text not null check (step in (
                     'card_tailor', 'panel_opened', 'panel_tailor',
                     'editor_opened', 'mentor_opened', 'downloaded'
                 )),
    surface      text,
    occurred_at  timestamptz not null default now()
);

create index if not exists core_loop_events_step_time
    on public.core_loop_events (step, occurred_at desc);
create index if not exists core_loop_events_user_job
    on public.core_loop_events (user_id, job_id);

alter table public.core_loop_events enable row level security;

comment on table public.core_loop_events is
  'Steps between a best job and an application that no other table records. '
  'Service role writes; see app/routers/telemetry.py record_loop_step.';

notify pgrst, 'reload schema';

commit;
