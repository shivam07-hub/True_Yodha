-- The first Match Run still dies on 57014. The 2026-09-28 shape sorted every
-- job that shared a skill, then opened jobs until the page was full. A CV
-- with "Communication" produced 23,977 ids. The first page averaged 3.3–3.7s
-- and maxed at 7,983ms, which is the authenticator's 8s statement_timeout.
-- The notice is still JOB initial_match (29 by 2026-11-02).
--
-- The person is waiting for a page of jobs they can apply to, not a sort of
-- every overlap. Start from jobs, keep the same live and country rules, and
-- stop at the page. A skill match is an exists on that job, so a common skill
-- fills 1,000 rows and does not read the rest of the corpus.
--
-- Same signature, same return columns, same cursor (`p_after_job_id` on
-- job_id). Reverse: re-apply 20260928100000.

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
    from public.jobs j
   where (p_after_job_id is null or j.job_id > p_after_job_id)
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
     and exists (
       select 1
         from public.job_skills js
        where js.job_id = j.job_id
          and js.skill_id in (
            select s.id
              from public.skills s
             where s.taxonomy_key = any(p_skill_keys)
          )
     )
   order by j.job_id
   limit greatest(1, least(coalesce(p_limit, 1000), 1000));
$$;

notify pgrst, 'reload schema';
