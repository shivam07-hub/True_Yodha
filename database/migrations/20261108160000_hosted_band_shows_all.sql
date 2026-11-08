-- The paid-internships band on Jobs shows every live, cleared internship hosted
-- on Myro, not only the ones he fits (Shivam, 2026-11-08: while there are few,
-- show them all). Fit now orders the band instead of filtering it: the ones
-- he fits by private.hosted_fit come first, then the most skill overlap, then
-- the newest. hosted_fit stays the one definition, still behind the recruiter's
-- "N people on Myro match".
--
-- A card leaves the band when he applies (job_applications.applied_at, the
-- Yes) or skips it. Saving it without applying no longer hides it: before this,
-- any job_applications row did.
--
-- The 20 is a payload ceiling, not a product rule: each row carries the full
-- description. Past 20 live, the Apply here filter on Jobs lists every one.
--
-- Reversible: re-apply hosted_internships_for from 20261108130000.

create or replace function public.hosted_internships_for(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p from public.user_profiles p where p.id = p_user_id
  ),
  -- His skills under both names the JD extractor matches on: the full display
  -- name and the bare pre-parenthetical one.
  mine as (
    select coalesce(array_agg(distinct n), '{}') as names
    from (
      select lower(k.display_name) as n
      from public.user_skills us join public.skills k on k.id = us.skill_id
      where us.user_id = p_user_id
      union
      select lower(trim(split_part(k.display_name, '(', 1)))
      from public.user_skills us join public.skills k on k.id = us.skill_id
      where us.user_id = p_user_id
    ) x
  ),
  live as (
    select j.*
    from public.jobs j
    where public.listing_is_live(j)
      and j.listing_venue = 'myro'
      and coalesce(j.hosted_review, 'cleared') = 'cleared'
  ),
  shown as (
    select
      j.*,
      coalesce((select private.hosted_fit(me.p, j.location, j.location_mode = 'remote',
                                          private.skill_ids_for(j.main_skills)) from me), false) as fits,
      (
        select coalesce(jsonb_agg(sk), '[]'::jsonb)
        from unnest(coalesce(j.main_skills, '{}')) as sk, mine
        where lower(trim(sk)) = any(mine.names)
      ) as matched
    from live j
    where not exists (
        select 1 from public.job_applications a
        where a.user_id = p_user_id and a.job_id = j.job_id and a.applied_at is not null
      )
      and not exists (
        select 1 from public.user_dismissed_job_cards d where d.user_id = p_user_id and d.job_id = j.job_id
      )
  ),
  top as (
    select * from shown
    order by fits desc, jsonb_array_length(matched) desc, first_seen desc
    limit 20
  )
  select jsonb_build_object(
    'total', (select count(*) from live),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'job_id', f.job_id, 'job_title', f.job_title, 'company_name', f.company_name,
        'job_description', f.job_description, 'industry', f.industry, 'apply_url', f.apply_url,
        'location', f.location, 'location_city', f.location_city, 'location_country', f.location_country,
        'location_mode', f.location_mode, 'locations', f.locations, 'role_family', f.role_family,
        'seniority_level', f.seniority_level, 'min_years_experience', f.min_years_experience,
        'max_years_experience', f.max_years_experience, 'main_skills', f.main_skills,
        'listing_venue', f.listing_venue, 'employment_kind', f.employment_kind,
        'stipend_low_inr', f.stipend_low_inr, 'stipend_high_inr', f.stipend_high_inr,
        'duration_months', f.duration_months, 'ppo', f.ppo, 'hosted_review', f.hosted_review,
        'first_seen', f.first_seen, 'is_active', f.is_active, 'listing_confidence', f.listing_confidence,
        'last_verified_live_at', f.last_verified_live_at,
        'last_conclusive_verification_at', f.last_conclusive_verification_at,
        'reactivated_at', f.reactivated_at,
        'matched_skills', f.matched
      ) order by f.fits desc, jsonb_array_length(f.matched) desc, f.first_seen desc)
      from top f
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.hosted_internships_for(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
