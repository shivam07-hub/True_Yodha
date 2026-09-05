-- Ghost Job Index — metric correction, before anything read it.
--
-- ghost-index-v1 defined a ghost as `last_in_feed >= closed_at`. Computed, that
-- returned 98% overall and exactly 1.000 for thirteen of the fifteen largest
-- employers. A metric that finds everyone maximally guilty is measuring the
-- instrument, not the world: our verifier drains 72k listings at ~19k/day, so a
-- close is usually DISCOVERED late, while the feed is crawled often — which
-- makes "last feed sighting after close" true almost by construction.
--
-- v2 asks the question the instrument can actually answer:
--
--   Of listings the employer's own ATS has conclusively stopped serving, how
--   many are STILL in the employer's own feed at our latest crawl — and for
--   those that were pulled, how long did that take?
--
-- 1,377 of 2,257 (61%) are still advertised, average 21 days and counting.
-- 837 were pulled, median 4.7 days. And 0 were dropped from the feed BEFORE the
-- close was observed — the feed never leads the ATS, which is what makes the
-- ordering evidence rather than noise.
--
-- The v1 table is replaced rather than extended: it holds only derived data,
-- was created in the same session, and has never been read by any code. Leaving
-- the tautological columns in place would have let them be published.

drop table if exists public.ghost_index_snapshot cascade;

create table public.ghost_index_snapshot (
  scope           text not null check (scope in ('overall', 'company', 'sector')),
  scope_key       text not null,
  -- 'all' carries corpus state; 'YYYY-MM' carries the cohort of listings we saw
  -- close in that month. Corpus-state columns are NULL on monthly rows — a
  -- monthly cell contains only closed listings, so a "live" count there would
  -- read as zero live roles rather than as not-applicable.
  period          text not null,

  listings_conclusive   integer,
  listings_closed       integer not null default 0,
  listings_live         integer,
  listings_inconclusive integer,

  -- The measurable population: closed on the ATS, and seen at least once in the
  -- employer feed. Nothing outside it can be judged either way.
  feed_overlap          integer not null default 0,

  -- Still advertised: never observed missing from the feed, last seen in it at
  -- or after the close.
  still_advertised      integer not null default 0,
  still_advertised_rate numeric(4, 3),
  avg_days_still_advertised numeric(5, 1),

  -- Pulled: the feed did drop it after the close. This is the honest half —
  -- these employers cleaned up, and how fast is worth publishing.
  ad_pulled_after_close integer not null default 0,
  median_days_to_pull   numeric(5, 1),

  -- Days from our first sight of the listing to the close. A lower bound on
  -- true advertised life: we cannot see a posting before we ingest it.
  median_observed_days  numeric(5, 1),

  method_version  text not null,
  computed_at     timestamptz not null default now(),
  primary key (scope, scope_key, period)
);

comment on table public.ghost_index_snapshot is
  'Ghost Job Index, precomputed. Public aggregate over public job listings: no '
  'user data, no PII. Every rate ships with its denominator and a method '
  'version, so a figure quoted from it stays checkable after the method moves.';

comment on column public.ghost_index_snapshot.feed_overlap is
  'Listings observed on both sides — employer ATS and employer feed. The only '
  'population in which the question can be answered at all.';

comment on column public.ghost_index_snapshot.still_advertised_rate is
  'still_advertised / feed_overlap. NULL below 20 jointly-observed listings: '
  'a rate over a handful of rows is noise wearing a percentage sign.';

comment on column public.ghost_index_snapshot.median_observed_days is
  'Median days between our first sight of a listing and its close. A LOWER '
  'BOUND on how long it was advertised — never the employer posting date.';

create index idx_ghost_index_snapshot_read
  on public.ghost_index_snapshot (scope, period, still_advertised_rate desc nulls last);

alter table public.ghost_index_snapshot enable row level security;

create policy ghost_index_snapshot_read on public.ghost_index_snapshot
  for select to anon, authenticated using (true);

grant select on public.ghost_index_snapshot to anon, authenticated;
grant select, insert, update, delete on public.ghost_index_snapshot to service_role;


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
    -- Same population as `in_scope`: a listing the scraper only ever saw
    -- MISSING was never observed advertised, so it can be neither still-up nor
    -- pulled. Without the `last_in_feed` clause the numerator counted rows the
    -- denominator did not, and ad_pulled exceeded feed_overlap.
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
    median_observed_days, method_version, computed_at
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
  'Recomputes the Ghost Job Index into ghost_index_snapshot (method '
  'ghost-index-v2). Full replace, not incremental: a partial rebuild that '
  'half-updates a published figure is worse than a slow one. Rates are withheld '
  'below 20 jointly-observed listings — counts still publish.';

revoke all on function public.refresh_ghost_index() from public, anon, authenticated;
grant execute on function public.refresh_ghost_index() to service_role;
