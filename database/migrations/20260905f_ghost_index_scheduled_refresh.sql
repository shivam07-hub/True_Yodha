-- Ghost Job Index — scheduled refresh, through the existing orchestration.
--
-- An index with a freshness stamp that nothing refreshes is a lie with a
-- timestamp on it. This wires `refresh_ghost_index()` into
-- `run_snapshot_sql_refresh`, which already owns the lease, the claim, the
-- attempt counter and the error capture for the other SQL-native snapshots.
-- A second scheduler would have been a second thing to keep alive.
--
-- Two consequences of reusing it:
--
-- 1. `refresh_ghost_index()` no longer writes `snapshot_refresh_state` itself.
--    Two writers to one row drift, and the orchestrator is the one with the
--    lease. It returns its result; `finish_snapshot_refresh` records it.
--
-- 2. Daily, not hourly. The refresh measures at 34.3s — 273k buffers, 5,839
--    temp blocks — because it walks 72k listings against 462k observations.
--    The other SQL snapshots retry hourly; this one must not. The project is
--    on shared Free/Nano compute holding 1,118MB against a 500MB recommended
--    size, where a 10-user Market burst already measures 2,161ms p95
--    (ARCHITECTURE_READ_PATH.md #16). 20:40 UTC is ~02:10 IST — the quietest
--    hour for an India-first product.
--
--    If the index ever needs to be hourly, that is an argument for the paid
--    compute gate, not for tightening the schedule on this instance.

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
  if p_task not in ('skill_demand', 'job_search', 'ghost_index') then
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


-- The refresh stops recording its own outcome: the orchestrator holds the lease
-- and owns the row. Keeping both writers meant a failed run could still leave a
-- 'succeeded' stamp written by the function that failed after it.
create or replace function public.refresh_ghost_index()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method   text := 'ghost-index-v2';
  v_min_cell integer := 20;
  v_rows     integer;
  v_companies integer;
begin
  select count(distinct nullif(btrim(company_name), '')) into v_companies from jobs;

  create temp table _gi_base on commit drop as
  with verifier_live as (
    select job_id, max(observed_at) as last_seen_live
    from job_listing_observations
    where observer = 'verifier' and result = 'seen_live'
    group by job_id
  )
  select
    j.job_id,
    nullif(btrim(j.company_name), '')    as company_name,
    nullif(btrim(j.industry_group), '')  as industry_group,
    c.closed_at,
    f.last_in_feed,
    f.dropped_from_feed,
    (c.closed_at is not null)                                as is_closed,
    (c.closed_at is null and v.last_seen_live is not null)   as is_live,
    (c.closed_at is not null or v.last_seen_live is not null) as is_conclusive,
    (c.closed_at is not null and f.last_in_feed is not null)  as in_scope,
    (c.closed_at is not null and f.last_in_feed is not null
       and f.dropped_from_feed is null
       and f.last_in_feed >= c.closed_at)                     as still_advertised,
    (c.closed_at is not null and f.last_in_feed is not null
       and f.dropped_from_feed is not null
       and f.dropped_from_feed > c.closed_at)                 as ad_pulled,
    case
      when c.closed_at is not null and f.last_in_feed is not null
       and f.dropped_from_feed is null and f.last_in_feed >= c.closed_at
      then extract(epoch from (f.last_in_feed - c.closed_at)) / 86400.0
    end                                                       as days_still_advertised,
    case
      when c.closed_at is not null and f.last_in_feed is not null
       and f.dropped_from_feed is not null
       and f.dropped_from_feed > c.closed_at
      then extract(epoch from (f.dropped_from_feed - c.closed_at)) / 86400.0
    end                                                       as days_to_pull,
    case
      when c.closed_at is not null and j.ingested_at is not null
       and c.closed_at > j.ingested_at
      then extract(epoch from (c.closed_at - j.ingested_at)) / 86400.0
    end                                                       as observed_days
  from jobs j
  left join listing_close_events  c on c.job_id = j.job_id
  left join listing_feed_presence f on f.job_id = j.job_id
  left join verifier_live         v on v.job_id = j.job_id;

  create temp table _gi_rows on commit drop as
  with expanded as (
    select 'overall'::text as scope, 'all'::text as scope_key, b.* from _gi_base b
    union all
    select 'company', b.company_name, b.* from _gi_base b where b.company_name is not null
    union all
    select 'sector', b.industry_group, b.* from _gi_base b where b.industry_group is not null
  ),
  periodised as (
    select e.*, 'all'::text as period from expanded e
    union all
    select e.*, to_char(e.closed_at, 'YYYY-MM') from expanded e where e.closed_at is not null
  )
  select
    scope, scope_key, period,
    count(*) filter (where is_conclusive)::int      as listings_conclusive,
    count(*) filter (where is_closed)::int          as listings_closed,
    count(*) filter (where is_live)::int            as listings_live,
    count(*) filter (where not is_conclusive)::int  as listings_inconclusive,
    count(*) filter (where in_scope)::int           as feed_overlap,
    count(*) filter (where still_advertised)::int   as still_advertised,
    count(*) filter (where ad_pulled)::int          as ad_pulled_after_close,
    round(avg(days_still_advertised)::numeric, 1)   as avg_days_still_advertised,
    round(percentile_cont(0.5) within group (order by days_to_pull)::numeric, 1)
                                                    as median_days_to_pull,
    round(percentile_cont(0.5) within group (order by observed_days)::numeric, 1)
                                                    as median_observed_days
  from periodised
  group by scope, scope_key, period;

  delete from ghost_index_snapshot;

  insert into ghost_index_snapshot (
    scope, scope_key, period,
    listings_conclusive, listings_closed, listings_live, listings_inconclusive,
    feed_overlap, still_advertised, still_advertised_rate,
    avg_days_still_advertised, ad_pulled_after_close, median_days_to_pull,
    median_observed_days, companies_in_corpus, method_version, computed_at
  )
  select
    scope, scope_key, period,
    case when period = 'all' then listings_conclusive end,
    listings_closed,
    case when period = 'all' then listings_live end,
    case when period = 'all' then listings_inconclusive end,
    feed_overlap, still_advertised,
    case when feed_overlap >= v_min_cell
         then round(still_advertised::numeric / feed_overlap, 3) end,
    case when feed_overlap >= v_min_cell then avg_days_still_advertised end,
    ad_pulled_after_close,
    case when ad_pulled_after_close >= v_min_cell then median_days_to_pull end,
    case when listings_closed >= v_min_cell then median_observed_days end,
    case when scope = 'overall' and period = 'all' then v_companies end,
    v_method, now()
  from _gi_rows;

  get diagnostics v_rows = row_count;

  return jsonb_build_object('rows', v_rows, 'method', v_method,
                            'companies_in_corpus', v_companies);
end;
$$;

revoke all on function public.refresh_ghost_index() from public, anon, authenticated;
grant execute on function public.refresh_ghost_index() to service_role;


-- A task-scoped request. `request_snapshot_refresh` exists for the hourly
-- retry crons and flips every task whose last success is older than 24 HOURS —
-- which silently breaks a DAILY schedule: this refresh takes 34s, so
-- `last_success_at` lands 34s after the cron minute, and the next day's run at
-- the same minute sees an age of 24h minus 34s, fails the test, and skips. The
-- index would then rebuild every other day while claiming a daily cadence.
--
-- Forcing is not the fix either: `request_snapshot_refresh(trigger, true)`
-- forces EVERY task, dragging the other snapshots along with it.
create or replace function public.request_snapshot_refresh_task(
  p_task text,
  p_trigger text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_requested boolean := false;
begin
  update public.snapshot_refresh_state s
     set status = 'pending',
         requested_at = now(),
         requested_by = left(coalesce(nullif(btrim(p_trigger), ''), 'unknown'), 80),
         updated_at = now()
   where s.task = p_task
     -- Never interrupt a live lease: the holder is mid-refresh.
     and not (s.status = 'running'
              and coalesce(s.lease_expires_at, '-infinity'::timestamptz) > now())
  returning true into v_requested;

  return coalesce(v_requested, false);
end;
$function$;

comment on function public.request_snapshot_refresh_task(text, text) is
  'Marks ONE task due, for a task that owns its own schedule. Unlike '
  'request_snapshot_refresh it applies no staleness heuristic — the cron IS '
  'the schedule — and it touches no other task.';

revoke all on function public.request_snapshot_refresh_task(text, text)
  from public, anon, authenticated;
grant execute on function public.request_snapshot_refresh_task(text, text) to service_role;


select cron.schedule(
  'ghost-index-daily-refresh',
  '40 20 * * *',
  $cron$
    select public.request_snapshot_refresh_task('ghost_index', 'cron:ghost-index');
    select public.run_snapshot_sql_refresh('ghost_index', 'cron:ghost-index');
  $cron$
);
