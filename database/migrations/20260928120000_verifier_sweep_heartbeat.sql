-- The verifier's liveness clock, separate from its work.
--
-- `verifier_last_attempt()` moves only when `claim_verify_targets` returns
-- rows. On 2026-09-28 all 48,099 schedule rows had been attempted inside the
-- 7-day window, so most 15-minute sweeps claimed nothing: `targets=0`, no
-- stamp. After two hours of that the dead-man read `stalled`, the Notice
-- opened, a claim closed it, and it reopened into `failed-close`. The belt
-- was idle, not dead.
--
-- The sweep now stamps this row every run. `verifier_health_snapshot` returns
-- it as `last_sweep`; the API reads liveness as the newer of it and the last
-- claim. One row, service-role only, same shape as notice_closer_heartbeat.
--
-- The productive clock was the second false alarm. The live snapshot (from
-- 20260813092000) read it from `job_listing_observations`, but the verifier
-- now writes an observation only for `closed`; `seen_live` stamps
-- `jobs.last_conclusive_verification_at` alone. Observations said 19:01 while
-- the jobs column said 02:01 the next day. It reads the jobs column now, through
-- `idx_jobs_conclusive_verification` (predicate matched, one index row).
-- (20260915181000_observation_thin_ledger.sql made the same move, was never
-- applied, and was retired on 2026-09-28: its delete would have erased the
-- verifier seen_live rows the Ghost Job Index still read.)
--
-- Additive. Reverse: drop the table, and re-apply verifier_health_snapshot
-- from 20260813092000_verifier_diagnostics_schedule.sql (the body live before).

begin;

create table if not exists public.verifier_sweep_heartbeat (
    id          boolean primary key default true check (id),
    swept_at    timestamptz not null,
    targets     integer not null,
    productive  integer not null
);

alter table public.verifier_sweep_heartbeat enable row level security;

create or replace function public.verifier_health_snapshot(
    p_priority_stale interval default '24:00:00'::interval
)
returns jsonb
language sql
stable
set search_path to ''
as $function$
    SELECT jsonb_build_object(
        'last_attempt', public.verifier_last_attempt(),
        'last_sweep', (
            SELECT h.swept_at FROM public.verifier_sweep_heartbeat h WHERE h.id
        ),
        'last_productive', (
            SELECT j.last_conclusive_verification_at
            FROM public.jobs j
            WHERE j.last_conclusive_verification_at IS NOT NULL
            ORDER BY j.last_conclusive_verification_at DESC
            LIMIT 1
        ),
        -- Exact priority backlog is an explicit operations diagnostic, not a
        -- health dependency. Keep health constant-time.
        'priority_due', NULL
    );
$function$;

notify pgrst, 'reload schema';

commit;
