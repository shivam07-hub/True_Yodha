-- Ghost Job Index — the computation.
--
-- SQL-native on purpose. The inputs are 462k observations against 72k listings;
-- pulling them into Python would hit the PostgREST 1000-row ceiling, which
-- truncates SILENTLY. The index would then be wrong in the one direction a
-- trust product cannot afford — quietly, and only at scale.
--
-- Method: ghost-index-v1.

create or replace function public.refresh_ghost_index()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method   text := 'ghost-index-v1';
  -- Below this many jointly-observed listings a rate is noise wearing a
  -- percentage sign. Counts still publish; the rate is withheld.
  v_min_cell integer := 20;
  v_rows     integer;
begin
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
    j.ingested_at,
    c.closed_at,
    c.has_strong_evidence,
    f.last_in_feed,
    f.dropped_from_feed,
    (c.closed_at is not null)                                   as is_closed,
    (c.closed_at is null and v.last_seen_live is not null)       as is_live,
    (c.closed_at is not null or v.last_seen_live is not null)    as is_conclusive,
    -- A ghost: the employer feed still carried the ad at or after the moment
    -- the employer's own ATS stopped serving the role.
    (c.closed_at is not null and f.last_in_feed is not null
       and f.last_in_feed >= c.closed_at)                        as is_ghost,
    case
      when c.closed_at is not null and f.last_in_feed is not null
       and f.last_in_feed >= c.closed_at
      then extract(epoch from (f.last_in_feed - c.closed_at)) / 86400.0
    end                                                          as ghost_days,
    case
      when c.closed_at is not null and j.ingested_at is not null
       and c.closed_at > j.ingested_at
      then extract(epoch from (c.closed_at - j.ingested_at)) / 86400.0
    end                                                          as advertised_days
  from jobs j
  left join listing_close_events  c on c.job_id = j.job_id
  left join listing_feed_presence f on f.job_id = j.job_id
  left join verifier_live         v on v.job_id = j.job_id;

  -- Every scope × period cell, computed once from a single scan each.
  create temp table _gi_rows on commit drop as
  with expanded as (
    select 'overall'::text as scope, 'all'::text as scope_key, b.*
      from _gi_base b
    union all
    select 'company', b.company_name, b.*
      from _gi_base b where b.company_name is not null
    union all
    select 'sector', b.industry_group, b.*
      from _gi_base b where b.industry_group is not null
  ),
  periodised as (
    -- Every listing counts in the 'all' period; a closed listing also counts in
    -- the month we saw it close. A listing with no close has no month — it
    -- cannot be attributed to one without inventing a date.
    select e.*, 'all'::text as period from expanded e
    union all
    select e.*, to_char(e.closed_at, 'YYYY-MM') from expanded e
     where e.closed_at is not null
  )
  select
    scope, scope_key, period,
    count(*) filter (where is_conclusive)::int          as listings_conclusive,
    count(*) filter (where is_closed)::int              as listings_closed,
    count(*) filter (where is_live)::int                as listings_live,
    count(*) filter (where not is_conclusive)::int      as listings_inconclusive,
    count(*) filter (where is_closed and last_in_feed is not null)::int as feed_overlap,
    count(*) filter (where is_ghost)::int               as ghost_listings,
    count(*) filter (where is_closed and last_in_feed is not null
                       and dropped_from_feed is null)::int as never_dropped,
    round(avg(ghost_days)::numeric, 1)                  as avg_ghost_days,
    round(percentile_cont(0.5) within group (order by ghost_days)::numeric, 1)
                                                        as median_ghost_days,
    round(percentile_cont(0.5) within group (order by advertised_days)::numeric, 1)
                                                        as median_advertised_days
  from periodised
  group by scope, scope_key, period;

  delete from ghost_index_snapshot;

  insert into ghost_index_snapshot (
    scope, scope_key, period,
    listings_conclusive, listings_closed, listings_live, listings_inconclusive,
    feed_overlap, ghost_listings, ghost_rate,
    avg_ghost_days, median_ghost_days, never_dropped,
    median_advertised_days, method_version, computed_at
  )
  select
    scope, scope_key, period,
    listings_conclusive, listings_closed, listings_live, listings_inconclusive,
    feed_overlap, ghost_listings,
    case when feed_overlap >= v_min_cell
         then round(ghost_listings::numeric / feed_overlap, 3) end,
    case when feed_overlap >= v_min_cell then avg_ghost_days end,
    case when feed_overlap >= v_min_cell then median_ghost_days end,
    never_dropped,
    case when listings_closed >= v_min_cell then median_advertised_days end,
    v_method, now()
  from _gi_rows;

  get diagnostics v_rows = row_count;

  update snapshot_refresh_state
     set status = 'succeeded', last_success_at = now(), updated_at = now(),
         attempts = 0, last_error = null,
         result = jsonb_build_object('rows', v_rows, 'method', v_method)
   where task = 'ghost_index';

  return jsonb_build_object('rows', v_rows, 'method', v_method);
end;
$$;

comment on function public.refresh_ghost_index() is
  'Recomputes the Ghost Job Index into ghost_index_snapshot. Full replace, not '
  'incremental: the index is small, and a partial rebuild that half-updates a '
  'published figure is worse than a slow one. Rates are withheld below 20 '
  'jointly-observed listings — counts still publish.';

revoke all on function public.refresh_ghost_index() from public, anon, authenticated;
grant execute on function public.refresh_ghost_index() to service_role;
