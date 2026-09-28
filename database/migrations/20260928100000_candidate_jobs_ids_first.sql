-- candidate_jobs_for_user: sort the ids, then open only the jobs a page needs.
--
-- The initial Match Run for a new user died on `57014` (Notice
-- work_lane:initial_match:APIError, 16 since 2026-09-20). pg_stat_statements:
-- the first page averaged 3.3–3.7s with max 7,983ms — the authenticator's 8s
-- statement_timeout killing it. Later pages averaged 122–174ms.
--
-- Measured on a real 30-skill CV (two generic skills, "Communication" and
-- "Customer Service"): the old shape joined job_skills → jobs for all 29,853
-- skill rows, one index probe into jobs each, then sorted the 23,977 survivors
-- to disk to keep the first 1,000 by job_id. 7,595ms warm, 17,727ms cold,
-- 125k buffers. The planner estimated 404 rows.
--
-- This shape sorts the distinct job_ids first (small tuples, in memory), then
-- probes jobs in that order and stops at the page size: 2,809 probes, 23k
-- buffers, 1,858ms warm on the same input (342ms as `authenticated`). Result
-- sets proven identical for page 1, a cursor page, and a country filter.
--
-- Same signature, same return type, same grants. Reverse: re-apply the body in
-- 20260818160000_candidate_jobs_for_user.sql.

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
language sql
stable
set search_path to 'public'
as $$
  select j.job_id,
         j.job_title,
         j.role_domain,
         j.career_band,
         j.seniority_level,
         j.min_years_experience,
         j.max_years_experience
    from (
      select distinct js.job_id
        from public.job_skills js
       where js.skill_id in (
               select s.id from public.skills s where s.taxonomy_key = any(p_skill_keys)
             )
         and (p_after_job_id is null or js.job_id > p_after_job_id)
       order by js.job_id
    ) ids
    cross join lateral (
      select *
        from public.jobs j
       where j.job_id = ids.job_id
         and (
           not p_require_fresh
           or (j.is_active is true and j.listing_confidence = 'active')
         )
         and (
           p_countries is null
           or cardinality(p_countries) = 0
           or lower(btrim(j.location_country)) = any(p_countries)
           or (
             (j.location_country is null or btrim(j.location_country) = '')
             and lower(btrim(j.location_mode)) in ('remote', 'hybrid')
           )
         )
    ) j
   order by ids.job_id
   limit greatest(1, least(coalesce(p_limit, 1000), 1000));
$$;
