-- The Match Run pool reads two narrow indexes, never the jobs heap.
--
-- Every Direction save starts a Match Run (`initial_match`), and its pool read
-- died on 57014: 12 of 12 on the worker on 2026-11-27, Notice
-- `capacity_503:db.statement_timeout:…fetch_candidate_jobs` open since
-- 2026-11-02 (150). /market filled only because the page starts the drain
-- itself.
--
-- Measured 2026-11-27 (117,434 jobs, 66,970 live, 59,865 live in India), the
-- real failing calls through PostgREST with the batch client:
--
--   * the planner expected 196 live India jobs: `lower(btrim(location_country))`
--     had no statistics (its only index is partial), so every plan over it was
--     built for a few hundred rows;
--   * `country = any(array)` gave up the (country, job_id) index's order, so a
--     page read all 59,865, then sorted;
--   * the walk read the wide jobs row for every job it passed (3,393 per page
--     of 1,000 on a generic CV): ~880 heap reads, ~10 MB a page, on an instance
--     whose disk baseline is 5 MB/s;
--   * a CV of rare skills (7 skills, 290 live India matches) had to walk all
--     59,865 to fill page 1: cancelled at 8 s every time;
--   * job_skills was half all-visible (70,535 dead rows), so its "index only"
--     probe made 13,780 heap fetches a page. Vacuumed on the day; the
--     autovacuum settings below keep it so.
--
-- What changes:
--   * statistics on the country expression (`jobs_country_key_stats`);
--   * idx_job_skills_skill_job (skill_id, job_id): a skill's jobs, index-only;
--   * idx_jobs_live_pool_cover: live jobs by job_id, carrying every column the
--     pool returns and the two it filters on, so neither path opens the heap;
--   * two ways in, chosen by how many job_skills rows the skills touch
--     (counted index-only, stopping at 30,001):
--       - up to 30,000: start from those rows, distinct job ids, probe the
--         live index. Rare-skill CV: 8.4 s cancelled → 576 ms.
--       - more: walk live jobs in job_id order and probe job_skills per job;
--         dense matches fill the page early. Generic CV, mid page:
--         3,555 ms → 906 ms; disk reads 1,329 → 437.
--     Measured on the generic CV, both shapes cross near 30,000 rows (~2 s).
--   * the cursor is `job_id > coalesce(p_after_job_id, '')`, one index
--     condition, and the function plans each call with its real arrays
--     (`plan_cache_mode = force_custom_plan`): a cached generic plan cannot
--     see how many skills or countries it was given.
--
-- Same signature, same return columns, the same rows: with countries, "that
-- country, or a remote/hybrid row with no country"; with none, every live
-- job; without p_require_fresh, every job (no caller passes false).
-- Reverse: re-apply 20261102235000; the indexes and statistics are additive.

create index concurrently if not exists idx_job_skills_skill_job
  on public.job_skills (skill_id, job_id);

create index concurrently if not exists idx_jobs_live_pool_cover
  on public.jobs (job_id)
  include (location_country, location_mode, job_title, role_domain, career_band,
           seniority_level, min_years_experience, max_years_experience)
  where is_active is true and listing_confidence = 'active';

create statistics if not exists public.jobs_country_key_stats
  on (lower(btrim(location_country))) from public.jobs;

alter table public.job_skills set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_insert_scale_factor = 0.05
);

analyze public.jobs;

create or replace function public.candidate_jobs_for_user(
    p_skill_keys text[],
    p_countries text[] default null,
    p_require_fresh boolean default true,
    p_after_job_id text default null,
    p_limit integer default 1000
)
returns table(
    job_id text,
    job_title text,
    role_domain text,
    career_band text,
    seniority_level text,
    min_years_experience integer,
    max_years_experience integer
)
language plpgsql
stable
set search_path to 'public'
set plan_cache_mode to 'force_custom_plan'
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 1000), 1000));
  v_after text := coalesce(p_after_job_id, '');
  v_countries text[] := array(
    select distinct c from unnest(coalesce(p_countries, array[]::text[])) as c where c is not null
  );
  v_skill_ids integer[];
  v_skill_rows integer;
begin
  select array_agg(s.id) into v_skill_ids
    from public.skills s
   where s.taxonomy_key = any(p_skill_keys);
  if v_skill_ids is null then
    return;
  end if;

  if p_require_fresh then
    select count(*) into v_skill_rows
      from (
        select 1
          from public.job_skills js
         where js.skill_id = any(v_skill_ids)
         limit 30001
      ) as counted;

    if v_skill_rows <= 30000 then
      -- Few rows: start from the skills.
      return query
      select j.job_id, j.job_title, j.role_domain, j.career_band,
             j.seniority_level, j.min_years_experience::integer, j.max_years_experience::integer
        from (
          select distinct js.job_id
            from public.job_skills js
           where js.skill_id = any(v_skill_ids)
             and js.job_id > v_after
        ) as matched
        join public.jobs j on j.job_id = matched.job_id
       where public.listing_is_live(j)
         and (
           cardinality(v_countries) = 0
           or lower(btrim(j.location_country)) = any(v_countries)
           or (
             (j.location_country is null or btrim(j.location_country) = '')
             and lower(btrim(j.location_mode)) in ('remote', 'hybrid')
           )
         )
       order by j.job_id
       limit v_limit;
      return;
    end if;

    -- Many rows: walk the live jobs; a dense match fills the page early.
    return query
    select j.job_id, j.job_title, j.role_domain, j.career_band,
           j.seniority_level, j.min_years_experience::integer, j.max_years_experience::integer
      from public.jobs j
     where public.listing_is_live(j)
       and j.job_id > v_after
       and (
         cardinality(v_countries) = 0
         or lower(btrim(j.location_country)) = any(v_countries)
         or (
           (j.location_country is null or btrim(j.location_country) = '')
           and lower(btrim(j.location_mode)) in ('remote', 'hybrid')
         )
       )
       and exists (
         select 1
           from public.job_skills js
          where js.job_id = j.job_id
            and js.skill_id = any(v_skill_ids)
       )
     order by j.job_id
     limit v_limit;
    return;
  end if;

  return query
  select j.job_id, j.job_title, j.role_domain, j.career_band,
         j.seniority_level, j.min_years_experience::integer, j.max_years_experience::integer
    from public.jobs j
   where j.job_id > v_after
     and (
       cardinality(v_countries) = 0
       or lower(btrim(j.location_country)) = any(v_countries)
       or (
         (j.location_country is null or btrim(j.location_country) = '')
         and lower(btrim(j.location_mode)) in ('remote', 'hybrid')
       )
     )
     and exists (
       select 1
         from public.job_skills js
        where js.job_id = j.job_id
          and js.skill_id = any(v_skill_ids)
     )
   order by j.job_id
   limit v_limit;
end;
$$;

revoke all on function public.candidate_jobs_for_user(text[], text[], boolean, text, integer) from public, anon;
grant execute on function public.candidate_jobs_for_user(text[], text[], boolean, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
