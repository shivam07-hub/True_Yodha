-- Global job search stops scanning the 563MB jobs table.
--
-- /jobs/search/global was returning **503** on prod for ordinary words. Measured
-- 2026-08-07, live: q=engineer 8,011ms 503, q=quantum 8,011ms 503. Both were the
-- authenticator role's 8s statement_timeout killing the query mid-scan.
--
-- The old shape was a five-column ILIKE OR against `jobs`:
--
--     job_title ILIKE '%x%' OR company_name ILIKE '%x%' OR location_city ...
--     ORDER BY first_seen DESC LIMIT 96
--
-- Three separate things were wrong with it.
--
-- 1. None of the OR branches could use an index, so it seq-scanned 62,225 rows.
--    Worse, the two trigram indexes that DID exist were both unusable for the
--    natural query text: idx_jobs_company_name_trgm is partial on a predicate
--    the planner cannot prove from ILIKE, and idx_jobs_job_title_trgm is on the
--    EXPRESSION coalesce(job_title,'') rather than the column. Proven: bare
--    `job_title ILIKE '%quantum%'` = 6,972ms, the identical query written as
--    `coalesce(job_title,'') ILIKE '%quantum%'` = 265ms. Same trap as
--    20260806_jobs_company_name_trgm_usable.sql, twice more.
--
-- 2. Cost depended on how RARE the user's word was. A common word found 12 rows
--    early and returned; a rare word scanned all 62,225. A search box whose
--    latency is a function of the user's vocabulary cannot take partner traffic.
--
-- 3. The ORDER BY was 98% of the remaining cost. Even once plain per-column
--    trigram indexes made the match itself fast (BitmapOr: 33ms to locate all
--    16,364 "engineer" matches), the sort forced fetching every one of those
--    16,364 WIDE rows — 10,840 heap blocks — just to keep the newest 96.
--    Dropping the ORDER BY made the identical query 63ms. The rows were the
--    problem, not the matching.
--
-- The fix follows from one measurement: the five columns search actually reads
-- total **5MB across the whole table**, against 563MB of table. So sort narrow
-- rows, then fetch wide ones only for the ~96 survivors.
--
-- `job_search_index` is those five fields concatenated into one blob per job.
-- The blob is not a new concept — `_global_search_rank` in the repository
-- already ranks against exactly this concatenation, so matching on it preserves
-- the existing semantics rather than changing them. The separator keeps a term
-- from matching across a field boundary, and the caller's rank filter (which
-- still checks fields individually) catches anything that slips through.
--
-- Measured after, same prod database:
--
--     q=engineer   4,284ms -> 177ms   (planner walks first_seen, stops at 96)
--     q=quantum   12,415ms ->  22ms   (planner switches to the GIN blob index)
--     q=zzzq          n/a  ->   0.2ms
--
-- Both plans come from the same statement — the planner picks per term
-- frequency, which is exactly the property the old shape lacked.
--
-- FRESHNESS: this is a materialized view, so search reflects the corpus as of
-- the last refresh, not the last INSERT. refresh_job_search_index() is called
-- from the scraper finalisation hook and the daily cron, riding the same dirty
-- guard as market_analytics_snapshot (routers/jobs/list.py). REFRESH ...
-- CONCURRENTLY keeps the old contents queryable during the rebuild, so the
-- failure mode is stale search, never broken search.
--
-- Additive and reversible: drop the view + function and revert the repository
-- to the PostgREST .or_() query.

create materialized view if not exists public.job_search_index as
select j.job_id,
       (coalesce(j.job_title,'')            || ' | ' ||
        coalesce(j.company_name,'')         || ' | ' ||
        coalesce(j.location_city,'')        || ' | ' ||
        coalesce(j.location_country::text,'') || ' | ' ||
        coalesce(j.role_domain,'')) as search_blob,
       j.first_seen
  from public.jobs j;

-- Unique index is REQUIRED for REFRESH MATERIALIZED VIEW CONCURRENTLY.
create unique index if not exists job_search_index_job_id
  on public.job_search_index (job_id);

-- Serves rare terms: locate the few matching rows directly.
create index if not exists job_search_index_blob_trgm
  on public.job_search_index using gin (search_blob gin_trgm_ops);

-- Serves common terms: walk newest-first and stop as soon as LIMIT is filled.
create index if not exists job_search_index_first_seen
  on public.job_search_index (first_seen desc nulls last);

analyze public.job_search_index;


create or replace function public.search_jobs_global(p_terms text[], p_limit integer)
returns table(
    job_id text,
    job_title text,
    company_name text,
    location_city text,
    location_country text,
    location_mode text,
    role_domain text,
    first_seen integer
)
language plpgsql
stable
set search_path to 'public'
as $$
declare
    v_preds text;
    v_sql   text;
    v_limit integer := greatest(1, least(coalesce(p_limit, 96), 500));
begin
    -- One ILIKE per expanded term, OR'd, against the narrow search index.
    -- format(%L) literal-quotes each term, so a user query cannot inject SQL.
    select string_agg(format('s.search_blob ilike %L', '%' || t || '%'), ' or ')
      into v_preds
      from unnest(coalesce(p_terms, array[]::text[])) as t
     where t is not null and length(t) > 0;

    if v_preds is null then
        return;
    end if;

    -- location_country and location_mode are varchar on jobs; both are cast to
    -- text so the returned row type matches this signature exactly.
    v_sql := format($f$
        select j.job_id, j.job_title, j.company_name, j.location_city,
               j.location_country::text, j.location_mode::text, j.role_domain, j.first_seen
          from (
                select s.job_id, s.first_seen
                  from public.job_search_index s
                 where %s
                 order by s.first_seen desc nulls last
                 limit %s
               ) hit
          join public.jobs j on j.job_id = hit.job_id
         order by hit.first_seen desc nulls last
    $f$, v_preds, v_limit);

    return query execute v_sql;
end;
$$;

comment on function public.search_jobs_global(text[], integer) is
  'Global job search over the narrow job_search_index, then a PK join back to jobs for the surviving window. Replaces a 5-column ILIKE OR against the 563MB jobs table (4,284ms for a common term) with ~180ms. Candidate window semantics are unchanged: newest p_limit matches; relevance ranking stays in the caller.';


create or replace function public.refresh_job_search_index()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_rows integer;
begin
    -- CONCURRENTLY so search keeps serving its previous contents during the
    -- rebuild. Requires the unique index on job_id, which exists above.
    refresh materialized view concurrently public.job_search_index;
    select count(*) into v_rows from public.job_search_index;
    return v_rows;
end;
$$;

comment on function public.refresh_job_search_index() is
  'Rebuild the global-search index from jobs. Called from the scraper finalisation hook and the daily cron, alongside the market_analytics_snapshot refresh — search freshness follows ingest, not request traffic.';

notify pgrst, 'reload schema';
