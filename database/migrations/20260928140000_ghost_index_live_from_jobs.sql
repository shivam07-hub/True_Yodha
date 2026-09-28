-- Ghost Job Index: a live confirmation counts wherever the verifier records it.
--
-- `refresh_ghost_index` decided `is_live` from verifier `seen_live` rows in
-- `job_listing_observations`. The verifier stopped writing those on
-- 2026-09-15 (it now writes an observation only for `closed`; `seen_live`
-- stamps `jobs.last_verified_live_at`). The index's live side froze there:
-- 20,242 confirmations since, none of them counted. Measured before this
-- change: published 11,091 live / 16,295 conclusive; with it, 19,000 / 24,205.
--
-- The method is unchanged — live still means the verifier saw the listing
-- open and it has no admissible close — so `method_version` stays
-- 'ghost-index-v2'. Only `verifier_live` changes: the observation history up
-- to 09-15 UNION the jobs column, so no older genuine check drops out.
--
-- Reverse: re-apply the body from 20260905f_ghost_index_scheduled_refresh.sql.

create or replace function public.refresh_ghost_index()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_method   text := 'ghost-index-v2';
  v_min_cell integer := 20;
  v_rows     integer;
  v_companies integer;
begin
  select count(distinct nullif(btrim(company_name), '')) into v_companies from jobs;

  create temp table _gi_base on commit drop as
  with verifier_live as (
    select job_id, max(seen_at) as last_seen_live
    from (
      select job_id, observed_at as seen_at
      from job_listing_observations
      where observer = 'verifier' and result = 'seen_live'
      union all
      select job_id, last_verified_live_at
      from jobs
      where last_verified_live_at is not null
    ) confirmations
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
$function$;
