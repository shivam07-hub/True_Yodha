-- Three Tier-0 refreshes move onto the in-database rail (ARCHITECTURE_READ_PATH §26).
--
-- `role_families`, `skill_closeness` and `company_pulse` ran on the HTTP rail: the
-- 06:15 cron posts to the API, and the API calls each refresh over PostgREST.
-- PostgREST connects as `authenticator`, whose role config preloads `safeupdate`
-- (a DELETE without WHERE is refused, 21000) and stops every statement at 8s
-- (57014). role_families last succeeded 2026-09-07; the other two never had.
-- Each failure was written to `snapshot_refresh_state` and read by nobody.
--
-- Measured 2026-10-04 as postgres, each in a rolled-back transaction:
--
--   role_families     52.4s labels + weights + bands + profile, then 2.3s core_skills
--   skill_closeness   22.7s   8,953 bonds  (7,287 in the table today)
--   company_pulse     15.7s   280 companies (268 rows, all from the 09-17 seed)
--
-- All three are over 8s, so `where true` on the DELETEs would only have swapped
-- 21000 for 57014. pg_cron runs as postgres, which has neither limit — the rail
-- skill_demand, job_search, ghost_index and sector_panel already use.

-- 1. The rail runs them. `role_families` also refreshes `core_skills`, the
--    vocabulary Direction Fit grades against. 20260916100000 says it "runs after
--    [refresh_role_family_labels], never instead of it" and then wired it to
--    nothing: it has not run since that migration.
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
    'role_families', 'skill_closeness', 'company_pulse'
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

-- 2. A daily refresh is due after 20 hours, not 24. The 06:15 HTTP cron asked
--    "older than 24h?" of a success stamped at 06:15:08 the day before: 23h59m52s,
--    not due. So analytics and company_directory refreshed every OTHER day — on
--    2026-10-04 analytics' last success was 10-03 and its next was 10-05. A 48h
--    dead-man would sit on that boundary. The hourly SQL tasks now come due
--    after ~21h instead of ~25h.
create or replace function public.request_snapshot_refresh(
  p_trigger text,
  p_force boolean default false
)
returns table(task text)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return query
  with claimable as (
    select s.task
      from public.snapshot_refresh_state s
     where not (
             s.status = 'running'
             and coalesce(s.lease_expires_at, '-infinity'::timestamptz) > now()
           )
       and (
         p_force
         or s.status in ('pending', 'failed')
         or s.last_success_at is null
         or s.last_success_at < now() - interval '20 hours'
       )
     for update skip locked
  )
  update public.snapshot_refresh_state s
     set status = 'pending',
         requested_at = now(),
         requested_by = left(coalesce(nullif(btrim(p_trigger), ''), 'unknown'), 80),
         updated_at = now()
    from claimable c
   where s.task = c.task
  returning s.task;
end;
$function$;

revoke all on function public.request_snapshot_refresh(text, boolean)
  from public, anon, authenticated;
grant execute on function public.request_snapshot_refresh(text, boolean) to service_role;

-- 3. Only the rail may run them. Each is SECURITY DEFINER and rewrites a table;
--    anon and authenticated held EXECUTE on all six, and company_directory
--    (~2.5s) fits inside anon's 3s limit — anyone with the public key could run
--    it on a loop. The three moved refreshes and core_skills lose service_role
--    too: called over PostgREST they can only fail, so the old path cannot be
--    wired back by accident. run_snapshot_sql_refresh calls them as its owner.
revoke all on function public.refresh_role_family_labels()
  from public, anon, authenticated, service_role;
revoke all on function public.refresh_direction_core_skills()
  from public, anon, authenticated, service_role;
revoke all on function public.refresh_skill_closeness()
  from public, anon, authenticated, service_role;
revoke all on function public.refresh_company_pulse()
  from public, anon, authenticated, service_role;
-- Still on the HTTP rail, which calls them as service_role.
revoke all on function public.refresh_company_directory()
  from public, anon, authenticated;
revoke all on function public.refresh_job_search_index()
  from public, anon, authenticated;

-- 4. Hourly, like job_search: the run claims only a pending or failed task, so
--    it does work after a scraper finalize (force=true marks every task pending),
--    after 20h without a success, or to retry a failure. Off the minutes the
--    other refreshes hold (:10, :30, 20:40, 20:50).
select cron.schedule(
  'role-families-refresh-retry',
  '20 * * * *',
  $cron$
    select public.request_snapshot_refresh('cron:role-families', false);
    select public.run_snapshot_sql_refresh('role_families', 'cron:role-families');
  $cron$
);

select cron.schedule(
  'skill-closeness-refresh-retry',
  '45 * * * *',
  $cron$
    select public.request_snapshot_refresh('cron:skill-closeness', false);
    select public.run_snapshot_sql_refresh('skill_closeness', 'cron:skill-closeness');
  $cron$
);

select cron.schedule(
  'company-pulse-refresh-retry',
  '55 * * * *',
  $cron$
    select public.request_snapshot_refresh('cron:company-pulse', false);
    select public.run_snapshot_sql_refresh('company_pulse', 'cron:company-pulse');
  $cron$
);

notify pgrst, 'reload schema';
