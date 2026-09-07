-- Daily refresh for the sector panel, through the orchestration the ghost index
-- already uses. One scheduler, not a second one to keep alive.
--
-- 10 minutes after the ghost index (20:40 UTC) so the cross-referenced
-- still-advertised rate is the one the index just published, never yesterday's.
-- Both are off-peak for an India-first product: 20:50 UTC is ~02:20 IST.

alter table public.snapshot_refresh_state
  drop constraint if exists snapshot_refresh_state_task_check;

alter table public.snapshot_refresh_state
  add constraint snapshot_refresh_state_task_check
  check (task in (
    'analytics', 'skill_demand', 'job_search',
    'role_families', 'company_directory',
    'ghost_index', 'sector_panel'
  ));

insert into public.snapshot_refresh_state (task, status, requested_by)
values ('sector_panel', 'pending', 'migration')
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
  if p_task not in ('skill_demand', 'job_search', 'ghost_index', 'sector_panel') then
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

select cron.schedule(
  'sector-panel-daily-refresh',
  '50 20 * * *',
  $cron$
    select public.request_snapshot_refresh_task('sector_panel', 'cron:sector-panel');
    select public.run_snapshot_sql_refresh('sector_panel', 'cron:sector-panel');
  $cron$
);
