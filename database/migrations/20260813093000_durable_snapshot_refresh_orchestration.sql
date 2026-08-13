-- Durable, independently retryable refresh state for the three Tier-0 corpus
-- products. The API only requests work; batch execution happens after the HTTP
-- acknowledgement, while SQL-native products also have their own pg_cron retry.

create table if not exists public.snapshot_refresh_state (
  task text primary key
    check (task in ('analytics', 'skill_demand', 'job_search')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed')),
  requested_at timestamptz not null default now(),
  requested_by text not null default 'migration',
  started_at timestamptz,
  lease_expires_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  attempts integer not null default 0 check (attempts >= 0),
  result jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.snapshot_refresh_state enable row level security;
revoke all on public.snapshot_refresh_state from public, anon, authenticated;
grant select, insert, update on public.snapshot_refresh_state to service_role;

do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'snapshot_refresh_state'
       and policyname = 'snapshot_refresh_service_role'
  ) then
    create policy snapshot_refresh_service_role
      on public.snapshot_refresh_state
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;

insert into public.snapshot_refresh_state (
  task, status, last_success_at, requested_by
)
select
  'analytics',
  case when refreshed_at is null then 'pending' else 'succeeded' end,
  refreshed_at,
  'migration'
from (select max(refreshed_at) as refreshed_at from public.market_analytics_snapshot) s
on conflict (task) do nothing;

insert into public.snapshot_refresh_state (
  task, status, last_success_at, requested_by
)
select
  'skill_demand',
  case when computed_at is null then 'pending' else 'succeeded' end,
  computed_at,
  'migration'
from (select max(computed_at) as computed_at from public.skill_demand_snapshot) s
on conflict (task) do nothing;

insert into public.snapshot_refresh_state (task, status, requested_by)
values ('job_search', 'pending', 'migration')
on conflict (task) do nothing;

create or replace function public.request_snapshot_refresh(
  p_trigger text,
  p_force boolean default false
)
returns table(task text)
language plpgsql
security definer
set search_path = ''
as $$
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
         or s.last_success_at < now() - interval '24 hours'
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
$$;

create or replace function public.claim_snapshot_refresh(
  p_task text,
  p_trigger text,
  p_lease_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean := false;
begin
  with claimable as (
    select s.task
      from public.snapshot_refresh_state s
     where s.task = p_task
       and (
         s.status in ('pending', 'failed')
         or (
           s.status = 'running'
           and coalesce(s.lease_expires_at, '-infinity'::timestamptz) <= now()
         )
       )
     for update skip locked
  )
  update public.snapshot_refresh_state s
     set status = 'running',
         started_at = now(),
         lease_expires_at = now() + make_interval(secs => greatest(60, p_lease_seconds)),
         requested_by = left(coalesce(nullif(btrim(p_trigger), ''), 'unknown'), 80),
         attempts = attempts + 1,
         updated_at = now()
    from claimable c
   where s.task = c.task
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.finish_snapshot_refresh(
  p_task text,
  p_success boolean,
  p_result jsonb default '{}'::jsonb,
  p_error text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.snapshot_refresh_state
     set status = case when p_success then 'succeeded' else 'failed' end,
         lease_expires_at = null,
         last_success_at = case when p_success then now() else last_success_at end,
         last_error_at = case when p_success then last_error_at else now() end,
         last_error = case when p_success then null else left(coalesce(p_error, 'unknown error'), 2000) end,
         result = coalesce(p_result, '{}'::jsonb),
         updated_at = now()
   where task = p_task;
$$;

-- SQL-native refreshes do not need Railway at all. This wrapper keeps their
-- failure state durable even though pg_cron itself only sees one SQL call.
create or replace function public.run_snapshot_sql_refresh(
  p_task text,
  p_trigger text default 'cron'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
  v_result jsonb;
  v_rows integer;
begin
  if p_task not in ('skill_demand', 'job_search') then
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
$$;

revoke all on function public.request_snapshot_refresh(text, boolean)
  from public, anon, authenticated;
revoke all on function public.claim_snapshot_refresh(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.finish_snapshot_refresh(text, boolean, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.run_snapshot_sql_refresh(text, text)
  from public, anon, authenticated;
grant execute on function public.request_snapshot_refresh(text, boolean) to service_role;
grant execute on function public.claim_snapshot_refresh(text, text, integer) to service_role;
grant execute on function public.finish_snapshot_refresh(text, boolean, jsonb, text) to service_role;
grant execute on function public.run_snapshot_sql_refresh(text, text) to service_role;

-- Hourly checks are cheap no-ops while fresh and become hourly retries after a
-- failure. They are staggered so the two corpus rebuilds never start together.
select cron.schedule(
  'skill-demand-refresh-retry',
  '10 * * * *',
  $$
    select public.request_snapshot_refresh('cron:skill-demand', false);
    select public.run_snapshot_sql_refresh('skill_demand', 'cron:skill-demand');
  $$
);

select cron.schedule(
  'job-search-refresh-retry',
  '30 * * * *',
  $$
    select public.request_snapshot_refresh('cron:job-search', false);
    select public.run_snapshot_sql_refresh('job_search', 'cron:job-search');
  $$
);

-- Deliberately do not alter the existing HTTP analytics cron here. Its Vault
-- URL is api.himyro.com (main), where the endpoint remains synchronous until Shivam
-- promotes Develop. Accelerating that old endpoint would multiply the timeout.

notify pgrst, 'reload schema';
