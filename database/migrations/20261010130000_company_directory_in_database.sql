-- company_directory joins the in-database Tier-0 rail (20261004100000).
--
-- Its refresh measured 13,640ms on 2026-10-10 (an index-only scan of 55,806
-- live rows with 5,323 heap fetches), so on the HTTP rail — PostgREST as
-- `authenticator`, statement_timeout 8s — it timed out every day from
-- 2026-10-06 (57014). Company pages read their role count from this table
-- (20261003150000), so their counts froze at 10-05. In-database it runs as
-- postgres under pg_cron with no 8s line, like role_families and company_pulse.

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
    'role_families', 'skill_closeness', 'company_pulse', 'company_directory'
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

-- Only the rail (owner postgres) calls it now.
revoke all on function public.refresh_company_directory()
  from public, anon, authenticated, service_role;

do $$
begin
  perform cron.unschedule(jobid) from cron.job
   where jobname = 'company-directory-refresh-retry';
end $$;

select cron.schedule(
  'company-directory-refresh-retry',
  '5 * * * *',
  $cmd$
    select public.request_snapshot_refresh('cron:company-directory', false);
    select public.run_snapshot_sql_refresh('company_directory', 'cron:company-directory');
  $cmd$
);
