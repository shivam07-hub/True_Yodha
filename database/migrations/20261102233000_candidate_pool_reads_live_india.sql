-- The page-stop still missed the 8s line. Measured after
-- 20261102231000, service role, skills Communication / Customer Service /
-- Leadership / Microsoft Excel, country India:
--
--   limit 20    57014 at 8.4s, twice
--   limit 1000  1,000 rows in 6.9s
--
-- A small limit walked jobs from the start of job_id and did not reach 20
-- India rows before the authenticator cancelled it. A large limit picked a
-- different plan and landed just under the same cliff. The first Match Run
-- asks for 1,000, so one slow moment still deletes the list.
--
-- `not p_require_fresh OR live` hides the live partial index, and
-- lower(country) OR remote-with-no-country hides a country index. Split those
-- into branches the planner can walk, and index the walk: live India jobs in
-- job_id order, and the blank-country remote/hybrid rows beside them.
--
-- Same signature and the same rows. A country filter is "that country, or a
-- remote/hybrid row with no country." Reverse: re-apply 20261102231000.

create index if not exists idx_jobs_live_country_jobid
  on public.jobs (lower(btrim(location_country)), job_id)
  where is_active is true and listing_confidence = 'active';

create index if not exists idx_jobs_live_blank_country_jobid
  on public.jobs (job_id)
  where is_active is true
    and listing_confidence = 'active'
    and (location_country is null or btrim(location_country) = '')
    and lower(btrim(location_mode)) in ('remote', 'hybrid');

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
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 1000), 1000));
  v_countries text[] := coalesce(p_countries, array[]::text[]);
begin
  if p_require_fresh and cardinality(v_countries) > 0 then
    return query
    select picked.job_id, picked.job_title, picked.role_domain, picked.career_band,
           picked.seniority_level, picked.min_years_experience, picked.max_years_experience
      from (
        (
          select j.job_id, j.job_title, j.role_domain, j.career_band,
                 j.seniority_level, j.min_years_experience::integer, j.max_years_experience::integer
            from public.jobs j
           where public.listing_is_live(j)
             and (p_after_job_id is null or j.job_id > p_after_job_id)
             and lower(btrim(j.location_country)) = any(v_countries)
             and exists (
               select 1
                 from public.job_skills js
                where js.job_id = j.job_id
                  and js.skill_id in (
                    select s.id from public.skills s
                     where s.taxonomy_key = any(p_skill_keys)
                  )
             )
           order by j.job_id
           limit v_limit
        )
        union all
        (
          select j.job_id, j.job_title, j.role_domain, j.career_band,
                 j.seniority_level, j.min_years_experience::integer, j.max_years_experience::integer
            from public.jobs j
           where public.listing_is_live(j)
             and (p_after_job_id is null or j.job_id > p_after_job_id)
             and (j.location_country is null or btrim(j.location_country) = '')
             and lower(btrim(j.location_mode)) in ('remote', 'hybrid')
             and exists (
               select 1
                 from public.job_skills js
                where js.job_id = j.job_id
                  and js.skill_id in (
                    select s.id from public.skills s
                     where s.taxonomy_key = any(p_skill_keys)
                  )
             )
           order by j.job_id
           limit v_limit
        )
      ) picked
     order by picked.job_id
     limit v_limit;
    return;
  end if;

  if p_require_fresh then
    return query
    select j.job_id, j.job_title, j.role_domain, j.career_band,
           j.seniority_level, j.min_years_experience::integer, j.max_years_experience::integer
      from public.jobs j
     where public.listing_is_live(j)
       and (p_after_job_id is null or j.job_id > p_after_job_id)
       and exists (
         select 1
           from public.job_skills js
          where js.job_id = j.job_id
            and js.skill_id in (
              select s.id from public.skills s
               where s.taxonomy_key = any(p_skill_keys)
            )
       )
     order by j.job_id
     limit v_limit;
    return;
  end if;

  return query
  select j.job_id, j.job_title, j.role_domain, j.career_band,
         j.seniority_level, j.min_years_experience::integer, j.max_years_experience::integer
    from public.jobs j
   where (p_after_job_id is null or j.job_id > p_after_job_id)
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
          and js.skill_id in (
            select s.id from public.skills s
             where s.taxonomy_key = any(p_skill_keys)
          )
     )
   order by j.job_id
   limit v_limit;
end;
$$;

notify pgrst, 'reload schema';
