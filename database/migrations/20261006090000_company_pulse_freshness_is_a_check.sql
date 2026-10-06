-- Company Demand Pulse freshness is the last time a verifier checked a live role.
--
-- Freshness is 20% of the pulse. `compute_pulse` decays it to zero over
-- `listing_time.CONFIRM_WITHIN` (7 days), the window a confirmation stays
-- sayable. What fed it was `last_seen_at` = max(coalesce(last_seen, first_seen))
-- over every row of the company, live or not: the crawler's marker, retired as a
-- time signal (ARCHITECTURE_LISTING_TIME.md, locked 2026-09-27). It is the
-- scraper's run date, the same for nearly every company. Decision: Shivam,
-- 2026-10-06.
--
-- Measured 2026-10-06 08:53 UTC, 267 scored companies:
--
--   marker today          239 on 09-30, 19 on 10-01, 7 on 09-09 (Wipro: 2,768
--                         live, freshness 0); on 10-07 the 239 reach day 7
--                         together
--   max(ingested_at)      0.998 correlated with the marker: the same run date
--   max(last_verified_live_at)
--                         two writers, the crawler's feed sighting and the
--                         verifier's check; 43k of 51k live stamps are the
--                         crawl's, and listing_time's same-day guard let 1,457
--                         of them through on 10-01
--   max(last_conclusive_verification_at) over live rows
--                         the verifier opened the page and a live posting
--                         answered: listing_trust's "checked". 179 companies
--                         inside 7 days. 257 pulses change, -6 to +20, mean
--                         +8.9 (Wipro 50 -> 70, Accenture 83 -> 100). 28
--                         companies never checked (Axis Bank, Infosys, ...)
--                         read freshness 0 until the verifier reaches them.
--
-- The last is the input. It lands in a new column, `last_checked_at`, so the
-- name says what it holds. The refresh no longer writes `last_seen_at`: it keeps
-- the value of its last refresh until it is dropped, which waits for main to
-- carry the `last_checked_at` reader (BACKLOG). `open_roles`, `weekly_delta`
-- and the inflow series are unchanged.
-- Runs on the in-database rail only (20261004100000) — no grant to anyone.

alter table public.company_pulse_snapshot
  add column if not exists last_checked_at timestamptz;

comment on column public.company_pulse_snapshot.last_checked_at is
  'Newest last_conclusive_verification_at over the company''s live rows: when a '
  'verifier last opened one of its open roles and a live posting answered. '
  'Feeds the pulse freshness component. Null = no live role ever checked.';

comment on column public.company_pulse_snapshot.last_seen_at is
  'Retired 2026-10-06 (20261006090000): no longer written by the refresh. '
  'Superseded by last_checked_at; dropped once main reads last_checked_at.';

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
  -- Checked = a verifier's conclusive check on a live row (listing_trust).
  -- Weekly = first_seen >= today-7. Series buckets = first_seen in [today-29, today].
  with src as (
    select
      lower(regexp_replace(btrim(j.company_name), '\s+', ' ', 'g')) as sort_key,
      regexp_replace(btrim(j.company_name), '\s+', ' ', 'g') as company_name,
      (j.is_active is true and j.listing_confidence = 'active') as is_live,
      j.first_seen,
      j.last_conclusive_verification_at
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
      max(last_conclusive_verification_at) filter (where is_live) as last_checked_at
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
      a.last_checked_at,
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
      last_checked_at, inflow_by_day, refreshed_at
    )
    select
      sort_key, company_name, open_roles, weekly_delta,
      last_checked_at, inflow_by_day, v_now
    from fresh
    where cardinality(inflow_by_day) = 30
    on conflict (sort_key) do update
      set company_name    = excluded.company_name,
          open_roles      = excluded.open_roles,
          weekly_delta    = excluded.weekly_delta,
          last_checked_at = excluded.last_checked_at,
          inflow_by_day   = excluded.inflow_by_day,
          refreshed_at    = excluded.refreshed_at
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

-- Refresh now, or `last_checked_at` stays null up to 20h. Through the rail so
-- the lease and `last_success_at` record it. Only this task is marked pending:
-- request_snapshot_refresh(force) would queue every task, role_families' 58s too.
update public.snapshot_refresh_state
   set status = 'pending',
       requested_at = now(),
       requested_by = 'migration_20261006090000',
       updated_at = now()
 where task = 'company_pulse'
   and status <> 'running';
select public.run_snapshot_sql_refresh('company_pulse', 'migration_20261006090000');

notify pgrst, 'reload schema';
