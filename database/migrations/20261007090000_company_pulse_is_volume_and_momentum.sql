-- Company Demand Pulse is volume and momentum. No freshness input.
--
-- 20261006090000 fed freshness (20% of the pulse) from the verifier's last
-- check on a live role. 28 companies holding 36% of live roles answer the
-- verifier with errors (Axis Bank 14,259 live: 7,127 errors; Infosys 1,231;
-- Cognizant 923 blocked; last attempt 09-15), so they lost 20 points for
-- Myro's blind spot, not for how they hire. The crawler's date before it was
-- the same day for every company. Shivam, 2026-10-07: drop freshness; the
-- pulse is volume and momentum at 5:3, scaled to 100 (`compute_pulse`).
--
-- The refresh no longer reads a time column. `last_checked_at` has no reader
-- once Develop serves the code that dropped it, and this migration is applied
-- after that deploy. `last_seen_at` stays until main carries the same code:
-- prod's pulse still selects it (BACKLOG · agent chores). `open_roles`,
-- `weekly_delta` and the inflow series are unchanged.
-- Runs on the in-database rail only (20261004100000) — no grant to anyone.

create or replace function public.refresh_company_pulse()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now          timestamptz := now();
  v_today        date := (timezone('utc', v_now))::date;
  v_week         integer := to_char(v_today - 7, 'YYYYMMDD')::integer;
  v_series_start integer := to_char(v_today - 29, 'YYYYMMDD')::integer;
  v_rows         integer;
begin
  -- Open = live, the predicate refresh_company_directory counts.
  -- Weekly = first_seen >= today-7. Series buckets = first_seen in [today-29, today].
  with src as (
    select
      lower(regexp_replace(btrim(j.company_name), '\s+', ' ', 'g')) as sort_key,
      regexp_replace(btrim(j.company_name), '\s+', ' ', 'g') as company_name,
      (j.is_active is true and j.listing_confidence = 'active') as is_live,
      j.first_seen
    from public.jobs as j
    where j.company_name is not null
      and btrim(j.company_name) <> ''
  ),
  agg as (
    select
      sort_key,
      min(company_name) as company_name,
      count(*) filter (where is_live)::integer as open_roles,
      count(*) filter (
        where first_seen is not null and first_seen >= v_week
      )::integer as weekly_delta
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
      inflow_by_day, refreshed_at
    )
    select
      sort_key, company_name, open_roles, weekly_delta,
      inflow_by_day, v_now
    from fresh
    where cardinality(inflow_by_day) = 30
    on conflict (sort_key) do update
      set company_name  = excluded.company_name,
          open_roles    = excluded.open_roles,
          weekly_delta  = excluded.weekly_delta,
          inflow_by_day = excluded.inflow_by_day,
          refreshed_at  = excluded.refreshed_at
    returning sort_key
  )
  select count(*)::integer into v_rows from upserted;

  delete from public.company_pulse_snapshot where refreshed_at <> v_now;

  return jsonb_build_object('companies', v_rows, 'refreshed_at', v_now);
end;
$$;

-- `create or replace` keeps the ACL 20261004100000 set (owner only).
revoke all on function public.refresh_company_pulse()
  from public, anon, authenticated, service_role;

-- No reader left: Develop's pulse selects sort_key, open_roles, weekly_delta,
-- inflow_by_day; main's never selected this column. Rebuildable from jobs.
alter table public.company_pulse_snapshot
  drop column if exists last_checked_at;

-- Refresh through the rail so the lease and `last_success_at` record it. Only
-- this task is marked pending: request_snapshot_refresh(force) would queue
-- every task, role_families' 58s too.
update public.snapshot_refresh_state
   set status = 'pending',
       requested_at = now(),
       requested_by = 'migration_20261007090000',
       updated_at = now()
 where task = 'company_pulse'
   and status <> 'running';
select public.run_snapshot_sql_refresh('company_pulse', 'migration_20261007090000');

notify pgrst, 'reload schema';
