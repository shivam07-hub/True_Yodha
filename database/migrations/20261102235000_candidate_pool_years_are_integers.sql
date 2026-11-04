-- The live-India pool answered, then refused to return. jobs.min_years_experience
-- and max_years_experience are smallint. The function promised integer, and
-- plpgsql will not coerce that on the way out (42804, column 6). Every first
-- Match Run now errors instead of timing out. Cast both years.
--
-- Indexes from 20261102233000 stay. This replaces only the function.

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
