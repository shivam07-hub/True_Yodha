-- Company Demand Pulse: stop paging the jobs heap on GET /jobs/companies/pulse.
--
-- ARCHITECTURE_READ_PATH.md §16 P4: caching a scan does not stop the scan.
-- indexable_companies already moved to company_directory (1.28ms). Pulse is
-- the harder half — any requested set used to cold-fill by reading every job
-- row for those companies through PostgREST .in_() pages of 1,000.
--
-- This snapshot is one row per folded company identity. The request path is
-- an indexed IN() lookup. Refresh runs on ingest through the existing lease.
-- Formula (0-100 pulse, sparkline) stays in Python so it cannot drift.

create table if not exists public.company_pulse_snapshot (
  sort_key       text primary key,
  company_name   text        not null,
  open_roles     integer     not null default 0,
  weekly_delta   integer     not null default 0,
  last_seen_at   timestamptz,
  inflow_by_day  integer[]   not null default array_fill(0, array[30])::integer[],
  refreshed_at   timestamptz not null default now(),
  constraint company_pulse_inflow_len check (cardinality(inflow_by_day) = 30)
);

comment on table public.company_pulse_snapshot is
  'Tier-0 Company Demand Pulse. One row per company identity (case and '
  'whitespace folded). Request path looks up this table; it never scans jobs. '
  'See CONTEXT.md Company Demand Pulse and migration 20260917120000.';

alter table public.company_pulse_snapshot enable row level security;

drop policy if exists "company demand pulse is public" on public.company_pulse_snapshot;
create policy "company demand pulse is public"
  on public.company_pulse_snapshot for select using (true);

grant select on public.company_pulse_snapshot to anon, authenticated, service_role;
revoke insert, update, delete on public.company_pulse_snapshot from anon, authenticated;

create or replace function public.refresh_company_pulse()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now          timestamptz := now();
  v_today        date := (timezone('utc', v_now))::date;
  v_fresh        integer := to_char(v_today - 21, 'YYYYMMDD')::integer;
  v_week         integer := to_char(v_today - 7, 'YYYYMMDD')::integer;
  v_series_start integer := to_char(v_today - 29, 'YYYYMMDD')::integer;
  v_rows         integer;
begin
  -- Live = last_seen YYYYMMDD >= today-21, same floor as STALE_AFTER_DAYS.
  -- Weekly = first_seen >= today-7. Series buckets = first_seen in [today-29, today].
  with src as (
    select
      lower(regexp_replace(btrim(j.company_name), '\s+', ' ', 'g')) as sort_key,
      regexp_replace(btrim(j.company_name), '\s+', ' ', 'g') as company_name,
      j.first_seen,
      j.last_seen
    from public.jobs as j
    where j.company_name is not null
      and btrim(j.company_name) <> ''
  ),
  agg as (
    select
      sort_key,
      min(company_name) as company_name,
      count(*) filter (
        where last_seen is not null and last_seen >= v_fresh
      )::integer as open_roles,
      count(*) filter (
        where first_seen is not null and first_seen >= v_week
      )::integer as weekly_delta,
      max(coalesce(last_seen, first_seen)) as last_marker
    from src
    group by sort_key
  ),
  buckets as (
    select
      sort_key,
      29 - (v_today - to_date(first_seen::text, 'YYYYMMDD')) as bucket,
      count(*)::integer as n
    from src
    where first_seen is not null
      and first_seen >= v_series_start
      and first_seen <= to_char(v_today, 'YYYYMMDD')::integer
      and first_seen::text ~ '^[0-9]{8}$'
    group by sort_key, 29 - (v_today - to_date(first_seen::text, 'YYYYMMDD'))
  ),
  fresh as (
    select
      a.sort_key,
      a.company_name,
      a.open_roles,
      a.weekly_delta,
      case
        when a.last_marker is null or a.last_marker::text !~ '^[0-9]{8}$' then null
        else (to_date(a.last_marker::text, 'YYYYMMDD'))::timestamp at time zone 'utc'
      end as last_seen_at,
      (
        select coalesce(
          array_agg(coalesce(b.n, 0) order by gs.i),
          array_fill(0, array[30])::integer[]
        )
        from generate_series(0, 29) as gs(i)
        left join buckets b
          on b.sort_key = a.sort_key and b.bucket = gs.i
      ) as inflow_by_day
    from agg a
  ),
  upserted as (
    insert into public.company_pulse_snapshot (
      sort_key, company_name, open_roles, weekly_delta,
      last_seen_at, inflow_by_day, refreshed_at
    )
    select
      sort_key, company_name, open_roles, weekly_delta,
      last_seen_at, inflow_by_day, v_now
    from fresh
    where cardinality(inflow_by_day) = 30
    on conflict (sort_key) do update
      set company_name  = excluded.company_name,
          open_roles    = excluded.open_roles,
          weekly_delta  = excluded.weekly_delta,
          last_seen_at  = excluded.last_seen_at,
          inflow_by_day = excluded.inflow_by_day,
          refreshed_at  = excluded.refreshed_at
    returning sort_key
  )
  select count(*)::integer into v_rows from upserted;

  delete from public.company_pulse_snapshot where refreshed_at <> v_now;

  return jsonb_build_object('companies', v_rows, 'refreshed_at', v_now);
end;
$$;

revoke all on function public.refresh_company_pulse() from public;
grant execute on function public.refresh_company_pulse() to service_role;

alter table public.snapshot_refresh_state
  drop constraint if exists snapshot_refresh_state_task_check;
alter table public.snapshot_refresh_state
  add constraint snapshot_refresh_state_task_check
  check (task = any (array['analytics', 'skill_demand', 'job_search',
                           'role_families', 'company_directory', 'ghost_index',
                           'sector_panel', 'skill_closeness', 'company_pulse']));

insert into public.snapshot_refresh_state (task, status, requested_by)
values ('company_pulse', 'pending', 'migration_20260917120000')
on conflict (task) do nothing;

-- SEED BEFORE SWAP — dev and prod share one database.
select public.refresh_company_pulse();

notify pgrst, 'reload schema';
