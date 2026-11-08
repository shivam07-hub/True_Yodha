-- One definition of "this person fits this paid internship", read by both
-- sides so the two numbers cannot drift:
--   * the recruiter's "N people on Myro match" (hosted_match_count), and
--   * the internships a seeker is shown on Jobs (hosted_internships_for).
-- Before this, the count had no level rule while the seeker side needed one,
-- so a recruiter would have been told about people who would never see her post.
--
-- A person fits when they are a real account (not is_test_account), their
-- target level is intern or entry (CONTEXT §Seniority Fit: "at level" for an
-- intern role; an empty target is never read as entry), they want the city —
-- any city for a remote role — and they hold at least one listed skill (any
-- skill when none are listed). Skills match on the full or bare
-- pre-parenthetical name, the JD extractor's rule.
--
-- Reversible:
--   drop function if exists public.hosted_internships_for(uuid);
--   drop function if exists private.hosted_fit(public.user_profiles, text, boolean, integer[]);
--   drop function if exists private.skill_ids_for(text[]);
--   and restore hosted_match_count from 20261107150000.

create or replace function private.skill_ids_for(p_names text[])
returns integer[]
language plpgsql
stable
set search_path = public
as $$
-- NULL when no skill is listed ("any skill"); '{}' when names were listed and
-- none resolve ("no one"). The names go into an array first: compared against
-- a subquery, the planner scanned all 35k skills (70ms); against an array it
-- probes idx_skills_lower_display_name / idx_skills_lower_bare_name.
declare
  v_names text[];
begin
  select array_agg(lower(trim(x))) into v_names
  from unnest(coalesce(p_names, '{}')) as x
  where trim(x) <> '';
  if v_names is null then
    return null;
  end if;
  return coalesce((
    select array_agg(s.id)
    from public.skills s
    where lower(s.display_name) = any(v_names)
       or lower(trim(split_part(s.display_name, '(', 1))) = any(v_names)
  ), '{}');
end;
$$;

create or replace function private.hosted_fit(
  p_profile public.user_profiles,
  p_city text,
  p_remote boolean,
  p_skill_ids integer[]
)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_profile.is_test_account, false) = false
    and lower(coalesce(p_profile.target_seniority, '')) in ('intern', 'entry')
    and (
      p_remote
      or (
        length(trim(coalesce(p_city, ''))) > 0
        and (
          p_profile.target_location ilike '%' || trim(p_city) || '%'
          or exists (
            select 1 from unnest(coalesce(p_profile.target_locations, '{}')) as t
            where t ilike '%' || trim(p_city) || '%'
          )
        )
      )
    )
    and exists (
      select 1 from public.user_skills us
      where us.user_id = p_profile.id
        and (p_skill_ids is null or us.skill_id = any(p_skill_ids))
    );
$$;

create or replace function public.hosted_match_count(
  p_city text,
  p_remote boolean,
  p_skills text[]
)
returns table (matched integer, active_30d integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids integer[] := private.skill_ids_for(p_skills);
begin
  return query
  select
    count(*)::integer,
    (count(*) filter (where p.last_active_at > now() - interval '30 days'))::integer
  from public.user_profiles p
  -- Pre-filter only: a strict subset of hosted_fit's own level clause, so the
  -- result is hosted_fit's alone. It keeps the per-row call to ~145 profiles
  -- instead of all of them (91ms -> see the migration note in the commit).
  where lower(coalesce(p.target_seniority, '')) in ('intern', 'entry')
    and private.hosted_fit(p, p_city, p_remote, v_ids);
end;
$$;

-- The paid internships hosted on Myro that this person fits, live and cleared,
-- that they have not already collected or skipped; plus how many are live in
-- all (the Apply here filter only appears when there is at least one).
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
  live as (
    select j.*
    from public.jobs j
    where public.listing_is_live(j)
      and j.listing_venue = 'myro'
      and coalesce(j.hosted_review, 'cleared') = 'cleared'
  ),
  fits as (
    select j.*
    from live j, me
    where private.hosted_fit(me.p, j.location, j.location_mode = 'remote', private.skill_ids_for(j.main_skills))
      and not exists (
        select 1 from public.job_applications a where a.user_id = p_user_id and a.job_id = j.job_id
      )
      and not exists (
        select 1 from public.user_dismissed_job_cards d where d.user_id = p_user_id and d.job_id = j.job_id
      )
    order by j.first_seen desc
    limit 5
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
        'matched_skills', (
          select coalesce(jsonb_agg(sk), '[]'::jsonb)
          from unnest(coalesce(f.main_skills, '{}')) as sk
          where exists (
            select 1 from public.user_skills us join public.skills k on k.id = us.skill_id
            where us.user_id = p_user_id
              and (lower(k.display_name) = lower(trim(sk))
                   or lower(trim(split_part(k.display_name, '(', 1))) = lower(trim(sk)))
          )
        )
      ) order by f.first_seen desc)
      from fits f
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.hosted_internships_for(uuid) from public, anon, authenticated;
revoke execute on function public.hosted_match_count(text, boolean, text[]) from public, anon, authenticated;
revoke execute on function private.hosted_fit(public.user_profiles, text, boolean, integer[]) from public, anon, authenticated;
revoke execute on function private.skill_ids_for(text[]) from public, anon, authenticated;

notify pgrst, 'reload schema';
