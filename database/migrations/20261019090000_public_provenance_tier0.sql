-- The provenance counts become Tier 0 (BACKLOG R12, ARCHITECTURE_READ_PATH.md §30).
--
-- `/public/stats` and `/jobs/contributions` counted `public.jobs` three times on
-- every cache fill: total, community, and verified-live. Measured 2026-10-12 →
-- 10-18: ~18 fills a day on prod, `verified_live` mean 3,329ms with a 7,997ms
-- max (the 8s ceiling) and ~886 shared blocks read per call; 37 counts timed out
-- and were cached as 0; one cold Vercel build ran it 45 times in a minute on the
-- shared database. The answer changes when the corpus lands, so it is computed
-- here once and read as one row.
--
-- This function is the one definition of "verified live" for the provenance
-- read model; `repositories/job_provenance.py` reads the row and counts nothing.

create table if not exists public.public_provenance_snapshot (
  id                   smallint    primary key default 1,
  total                integer     not null,
  community            integer     not null,
  verified_live        integer     not null,
  verified_window_days integer     not null,
  refreshed_at         timestamptz not null default now(),
  constraint public_provenance_snapshot_one_row check (id = 1)
);

comment on table public.public_provenance_snapshot is
  'Tier-0 provenance counts behind /public/stats and /jobs/contributions. One '
  'row, refreshed on the in-database rail (task public_provenance). The request '
  'path reads this row; it never counts jobs. Migration 20261019090000.';

alter table public.public_provenance_snapshot enable row level security;

-- The backend reads it with the service role; nothing else needs it.
revoke all on public.public_provenance_snapshot from anon, authenticated;
grant select on public.public_provenance_snapshot to service_role;

create or replace function public.refresh_public_provenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The window the hero number claims: a listing we opened inside a week.
  v_window_days   constant integer := 7;
  v_total         integer;
  v_community     integer;
  v_verified_live integer;
begin
  -- Three counts, not one scan: each of these has its own index, and a single
  -- pass over the whole heap would read more of it than the three together.
  select count(*)::integer into v_total from public.jobs;

  -- `jobs.ingestion_source` value the extension import writes
  -- (services/job_importer.build_imported_job). NULL and everything else is
  -- the agent's crawl, so agent = total - community.
  select count(*)::integer into v_community
    from public.jobs
   where ingestion_source = 'extension';

  -- Both halves. `last_conclusive_verification_at` says a verifier opened it,
  -- not that it was open: on 2026-09-23, 8,295 of 27,681 listings checked
  -- inside a week had been found dead. Never `last_verified_live_at`, which the
  -- crawler stamps for any job_id it sees in an employer's feed.
  select count(*)::integer into v_verified_live
    from public.jobs
   where last_conclusive_verification_at >= now() - make_interval(days => v_window_days)
     and is_active = true
     and listing_confidence = 'active';

  insert into public.public_provenance_snapshot (
    id, total, community, verified_live, verified_window_days, refreshed_at
  )
  values (1, v_total, v_community, v_verified_live, v_window_days, now())
  on conflict (id) do update
    set total                = excluded.total,
        community            = excluded.community,
        verified_live        = excluded.verified_live,
        verified_window_days = excluded.verified_window_days,
        refreshed_at         = excluded.refreshed_at;

  return jsonb_build_object(
    'total', v_total,
    'community', v_community,
    'verified_live', v_verified_live,
    'verified_window_days', v_window_days
  );
end;
$$;

-- Only the rail (owner postgres) calls it.
revoke all on function public.refresh_public_provenance()
  from public, anon, authenticated, service_role;

alter table public.snapshot_refresh_state
  drop constraint if exists snapshot_refresh_state_task_check;
alter table public.snapshot_refresh_state
  add constraint snapshot_refresh_state_task_check
  check (task = any (array['analytics', 'skill_demand', 'job_search',
                           'role_families', 'company_directory', 'ghost_index',
                           'sector_panel', 'skill_closeness', 'company_pulse',
                           'public_provenance']));

insert into public.snapshot_refresh_state (task, status, requested_by)
values ('public_provenance', 'pending', 'migration_20261019090000')
on conflict (task) do nothing;

create or replace function public.run_snapshot_sql_refresh(
  p_task text,
  p_trigger text default 'cron'::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_claimed boolean;
  v_result jsonb;
  v_rows integer;
begin
  if p_task not in (
    'skill_demand', 'job_search', 'ghost_index', 'sector_panel',
    'role_families', 'skill_closeness', 'company_pulse', 'company_directory',
    'public_provenance'
  ) then
    raise exception 'unsupported SQL snapshot refresh task: %', p_task;
  end if;

  v_claimed := public.claim_snapshot_refresh(p_task, p_trigger, 900);
  if not v_claimed then
    return jsonb_build_object('task', p_task, 'status', 'skipped');
  end if;

  begin
    if p_task = 'skill_demand' then
      select coalesce(to_jsonb(r), '{}'::jsonb)
        into v_result
        from public.refresh_skill_demand_snapshot() r;
    elsif p_task = 'ghost_index' then
      select public.refresh_ghost_index() into v_result;
    elsif p_task = 'sector_panel' then
      select public.refresh_sector_panel() into v_result;
    elsif p_task = 'role_families' then
      select public.refresh_role_family_labels() into v_result;
      v_result := v_result || jsonb_build_object(
        'core_skills', public.refresh_direction_core_skills() -> 'families'
      );
    elsif p_task = 'skill_closeness' then
      select public.refresh_skill_closeness() into v_result;
    elsif p_task = 'company_pulse' then
      select public.refresh_company_pulse() into v_result;
    elsif p_task = 'company_directory' then
      select public.refresh_company_directory() into v_result;
    elsif p_task = 'public_provenance' then
      select public.refresh_public_provenance() into v_result;
    else
      select public.refresh_job_search_index() into v_rows;
      v_result := jsonb_build_object('rows', v_rows);
    end if;

    perform public.finish_snapshot_refresh(p_task, true, v_result, null);
    return jsonb_build_object('task', p_task, 'status', 'succeeded', 'result', v_result);
  exception when others then
    perform public.finish_snapshot_refresh(p_task, false, '{}'::jsonb, sqlerrm);
    raise warning 'snapshot refresh failed task=% error=%', p_task, sqlerrm;
    return jsonb_build_object('task', p_task, 'status', 'failed', 'error', sqlerrm);
  end;
end;
$function$;

revoke all on function public.run_snapshot_sql_refresh(text, text)
  from public, anon, authenticated;
grant execute on function public.run_snapshot_sql_refresh(text, text) to service_role;

-- Hourly, like the other in-database tasks: the run claims only a pending or
-- failed task, so it does work after a scraper finalize (force=true marks every
-- task pending), after 20h without a success, or to retry a failure. :35 is a
-- minute no other refresh holds (:05 :10 :20 :30 :45 :55, 20:40, 20:50).
do $$
begin
  perform cron.unschedule(jobid) from cron.job
   where jobname = 'public-provenance-refresh-retry';
end $$;

select cron.schedule(
  'public-provenance-refresh-retry',
  '35 * * * *',
  $cmd$
    select public.request_snapshot_refresh('cron:public-provenance', false);
    select public.run_snapshot_sql_refresh('public_provenance', 'cron:public-provenance');
  $cmd$
);

-- Fill the row now, so no reader ever finds the table empty after this lands.
select public.run_snapshot_sql_refresh('public_provenance', 'migration_20261019090000');

notify pgrst, 'reload schema';
