-- Ghost Job Index — move the corpus company count off the request path.
--
-- The coverage block carried `select count(distinct company_name) from jobs`,
-- read live. As `service_role` that is unremarkable. As `anon` it is 6,041ms:
--
--   Aggregate (actual time=6041.220..6041.224)
--     -> Sort  Sort Method: external merge  Disk: 1240kB
--       -> Bitmap Heap Scan on jobs  Heap Blocks: exact=12276
--            Recheck Cond: ((is_active AND listing_confidence='active')
--                            OR created_by_user_id = auth.uid())
--
-- `idx_jobs_trusted_ingested_at` is PARTIAL on the first branch of that policy,
-- and the planner cannot reach a partial index through an OR whose other branch
-- can match rows outside its predicate — so it rechecks every candidate from
-- the heap. Through PostgREST the whole payload then hit the authenticator
-- role's 8s statement timeout and the endpoint 500'd.
--
-- READ_PATH_PLAYBOOK.md trap 5, and the fix it prefers first: precompute. The
-- count changes when the corpus changes, not when someone loads a page, and the
-- refresh already runs as service_role where the same count is cheap.

alter table public.ghost_index_snapshot
  add column if not exists companies_in_corpus integer;

comment on column public.ghost_index_snapshot.companies_in_corpus is
  'Distinct employers in the corpus at refresh time. Written only on the '
  'overall/all row — it is corpus state, not a property of a scope. Lives here '
  'because counting it live costs 6s under the jobs RLS policy.';


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

  update snapshot_refresh_state
     set status = 'succeeded', last_success_at = now(), updated_at = now(),
         attempts = 0, last_error = null,
         result = jsonb_build_object('rows', v_rows, 'method', v_method)
   where task = 'ghost_index';

  return jsonb_build_object('rows', v_rows, 'method', v_method,
                            'companies_in_corpus', v_companies);
end;
$$;

revoke all on function public.refresh_ghost_index() from public, anon, authenticated;
grant execute on function public.refresh_ghost_index() to service_role;


create or replace function public.ghost_index_payload()
returns jsonb
language sql
stable
as $$
  with overall as (
    select * from ghost_index_snapshot where scope = 'overall' and period = 'all'
  ),
  months as (
    select * from ghost_index_snapshot
     where scope = 'overall' and period <> 'all'
       and listings_closed >= 20
     order by period
  ),
  companies as (
    select * from ghost_index_snapshot
     where scope = 'company' and period = 'all' and still_advertised_rate is not null
     order by still_advertised_rate desc, feed_overlap desc
  ),
  sectors as (
    select * from ghost_index_snapshot
     where scope = 'sector' and period = 'all' and still_advertised_rate is not null
     order by still_advertised_rate desc, feed_overlap desc
  )
  select jsonb_build_object(
    'method', (select method_version from overall),
    'computed_at', (select computed_at from overall),
    'overall', (select to_jsonb(o) - 'scope' - 'scope_key' - 'method_version'
                       - 'companies_in_corpus' from overall o),
    'months', coalesce((select jsonb_agg(to_jsonb(m) - 'scope' - 'scope_key' - 'method_version'
                                         - 'companies_in_corpus')
                          from months m), '[]'::jsonb),
    'companies', coalesce((select jsonb_agg(to_jsonb(c) - 'scope' - 'method_version'
                                            - 'listings_conclusive' - 'listings_live'
                                            - 'listings_inconclusive' - 'companies_in_corpus')
                             from companies c), '[]'::jsonb),
    'sectors', coalesce((select jsonb_agg(to_jsonb(s) - 'scope' - 'method_version'
                                          - 'listings_conclusive' - 'listings_live'
                                          - 'listings_inconclusive' - 'companies_in_corpus')
                           from sectors s), '[]'::jsonb),
    'coverage', jsonb_build_object(
      'min_cell', 20,
      'companies_published', (select count(*) from companies),
      'companies_with_closures', (
        select count(*) from ghost_index_snapshot
         where scope = 'company' and period = 'all' and listings_closed > 0
      ),
      -- Read from the snapshot, never counted live: see the migration header.
      'companies_in_corpus', (select companies_in_corpus from overall)
    )
  );
$$;

comment on function public.ghost_index_payload() is
  'The whole public Ghost Job Index in one round trip, including the coverage '
  'statement. Touches only ghost_index_snapshot — nothing here reads '
  'public.jobs, whose RLS policy costs 6s to aggregate as anon.';

grant execute on function public.ghost_index_payload() to anon, authenticated, service_role;
