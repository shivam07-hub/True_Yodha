-- One body-encoded read for the Match Run candidate pool.
--
-- The old path was four sequential PostgREST round-trips that scaled with the
-- pool: skill-overlap ids, then location filter, then freshness filter, then
-- get_jobs_by_ids for eligibility columns. `.in_("job_id", …)` serialises
-- ~19 bytes per id into the URL. httpx throws at 65,536 → ~3,440 ids.
-- Measured 2026-08-18: 127 of 332 users (38%) can never complete a Match Run,
-- and most of the rest are silently truncated at PostgREST's 1,000-row cap.
-- Pool filtering also cost 2 × ceil(N/200) round trips — 62 at p90.
--
-- This RPC returns eligibility columns. It does NOT decide eligibility.
-- `job_is_eligible` stays in Python (one derivation, cached per user/job).
--
-- Location copies `_filter_job_ids_by_location` byte-for-byte:
--   country in the lowercase target set
--   OR (country is blank AND mode is remote/hybrid).
-- Freshness copies `_filter_job_ids_by_recommendability`:
--   is_active AND listing_confidence = 'active'.
-- `last_seen` is deliberately absent — verifier-owned, not scraper-owned.
--
-- Pagination is keyset on job_id so PostgREST db-max-rows (1,000) cannot
-- silently cap the pool. Python walks pages until a short one.

create or replace function public.candidate_jobs_for_user(
  p_skill_keys text[],
  p_countries text[] default null,
  p_require_fresh boolean default true,
  p_after_job_id text default null,
  p_limit integer default 1000
)
returns table (
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
security invoker
set search_path to 'public'
as $$
  select distinct on (j.job_id)
         j.job_id,
         j.job_title,
         j.role_domain,
         j.career_band,
         j.seniority_level,
         j.min_years_experience,
         j.max_years_experience
    from public.skills s
    join public.job_skills js on js.skill_id = s.id
    join public.jobs j on j.job_id = js.job_id
   where s.taxonomy_key = any(p_skill_keys)
     and (p_after_job_id is null or j.job_id > p_after_job_id)
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
   order by j.job_id
   limit greatest(1, least(coalesce(p_limit, 1000), 1000));
$$;

comment on function public.candidate_jobs_for_user(text[], text[], boolean, text, integer) is
  'Skill-overlapping jobs with eligibility columns for a Match Run. Location = country in lowercase target set OR (blank country AND remote/hybrid). Freshness = is_active AND listing_confidence=active; last_seen is ignored. Keyset-paginated on job_id so PostgREST db-max-rows cannot silently cap the pool. Does not decide eligibility — that stays in Python.';

revoke all on function public.candidate_jobs_for_user(text[], text[], boolean, text, integer)
  from public, anon;
grant execute on function public.candidate_jobs_for_user(text[], text[], boolean, text, integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';
