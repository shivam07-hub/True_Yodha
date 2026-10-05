-- Company Demand Pulse counts the roles that are live, not the ones crawled lately.
--
-- `open_roles` counted rows whose `last_seen` was within 21 days. `last_seen` is
-- retired as a time signal (ARCHITECTURE_LISTING_TIME.md, locked 2026-09-27), and
-- "live" already has one definition: `company_directory.active_count`, the count
-- every company page reads. /companies showed both on one screen — Axis Bank's
-- pulse card said 10,496 open roles, its row beneath said 14,259.
--
-- Measured 2026-10-04 against the 08:55 cron snapshot:
--
--   pulse sum 50,260 · live 57,522 · 82 of 280 companies counted wrong
--   1,188 rows counted that are not live · 8,450 live rows not counted
--   4 companies with a pulse and nothing live (Meta 24, EY India 72)
--   8 live companies read "no live roles" (Wipro: 2,768 live)
--
-- Only `open_roles` changes. `weekly_delta` (first_seen in 7 days), the 30-day
-- inflow histogram and `last_seen_at` keep their semantics. The predicate is
-- `refresh_company_directory`'s, verbatim; identity stays the pulse fold (case
-- and inner whitespace), so one pulse row sums every directory row it folds.
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
      count(*) filter (where is_live)::integer as open_roles,
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

-- `create or replace` keeps the ACL 20261004100000 set (owner only).
revoke all on function public.refresh_company_pulse()
  from public, anon, authenticated, service_role;

-- Refresh now, or the new count waits up to 20h for the next due run. Through
-- the rail so the lease and `last_success_at` record it. Only this task is marked
-- pending: request_snapshot_refresh(force) would queue every task, role_families'
-- 58s too.
update public.snapshot_refresh_state
   set status = 'pending',
       requested_at = now(),
       requested_by = 'migration_20261004120000',
       updated_at = now()
 where task = 'company_pulse'
   and status <> 'running';
select public.run_snapshot_sql_refresh('company_pulse', 'migration_20261004120000');

notify pgrst, 'reload schema';
