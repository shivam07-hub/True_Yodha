-- A Myro Supported job fits by years, not by the student rule (Shivam,
-- 2026-11-17). The recruiter states the years from (0 = fresher), and an
-- optional to. Before this, every Myro row was read as an internship: a job
-- for experienced people counted only intern/entry seekers and fit no one.
--
-- A job fits a person when the employer's minimum is within reach of the top
-- of the person's year span: the `candidates_for_user` level rule, so the
-- recruiter's count and the seeker's Jobs list read years the same way. The
-- span is years +- 1 when years are on record, else the target level's span,
-- else open (0-40): a person with neither is counted, and asked his years
-- once when he opens such a job. There is no ceiling: a person with more
-- years than the "to" is counted, as on Jobs (Shivam, 2026-09-28).
-- Internships keep the intern/entry rule. City and skills are unchanged.
--
-- hosted_match_count keeps its three-argument call working (defaults), so the
-- backend on main reads internships exactly as before.
--
-- Reversible: re-apply hosted_fit, hosted_match_count and
-- hosted_internships_for from 20261108130000 and 20261108160000, then
--   drop function private.hosted_fit(public.user_profiles, text, boolean, integer[], text, numeric);
--   drop function public.hosted_match_count(text, boolean, text[], text, numeric);
--   drop function private.person_year_hi(public.user_profiles);

-- The top of a person's year span. The same six rows as candidates_for_user.
create or replace function private.person_year_hi(p_profile public.user_profiles)
returns numeric
language sql
stable
set search_path = public
as $$
  select case
    when p_profile.years_experience is not null
      then p_profile.years_experience::numeric + 1
    else coalesce((
      select b.hi::numeric from (values
        ('intern', 0, 1), ('entry', 0, 2), ('mid', 2, 5),
        ('senior', 5, 8), ('lead', 8, 12), ('executive', 12, 40)
      ) as b(band, lo, hi)
      where b.band = lower(coalesce(p_profile.target_seniority, ''))
    ), 40)
  end;
$$;

create or replace function private.hosted_fit(
  p_profile public.user_profiles,
  p_city text,
  p_remote boolean,
  p_skill_ids integer[],
  p_kind text,
  p_min_years numeric
)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_profile.is_test_account, false) = false
    and case
      when p_kind = 'full_time'
        then coalesce(p_min_years, 0) <= private.person_year_hi(p_profile)
      else lower(coalesce(p_profile.target_seniority, '')) in ('intern', 'entry')
    end
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

-- A new argument list is a new function. Drop the three-argument one first,
-- or a call with three named arguments matches both and PostgREST refuses it.
drop function if exists public.hosted_match_count(text, boolean, text[]);

create or replace function public.hosted_match_count(
  p_city text,
  p_remote boolean,
  p_skills text[],
  p_kind text default 'internship',
  p_min_years numeric default null
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
  -- Pre-filter only, for an internship: a strict subset of hosted_fit's own
  -- level clause, so the per-row call runs on ~150 profiles, not all of them.
  where (p_kind = 'full_time' or lower(coalesce(p.target_seniority, '')) in ('intern', 'entry'))
    and private.hosted_fit(p, p_city, p_remote, v_ids, p_kind, p_min_years);
end;
$$;

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
                                          private.skill_ids_for(j.main_skills),
                                          j.employment_kind, j.min_years_experience::numeric)
                from me), false) as fits,
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

-- Nothing calls the four-argument fit any more.
drop function if exists private.hosted_fit(public.user_profiles, text, boolean, integer[]);

revoke execute on function private.person_year_hi(public.user_profiles) from public, anon, authenticated;
revoke execute on function private.hosted_fit(public.user_profiles, text, boolean, integer[], text, numeric)
  from public, anon, authenticated;
revoke execute on function public.hosted_match_count(text, boolean, text[], text, numeric)
  from public, anon, authenticated;
grant execute on function public.hosted_match_count(text, boolean, text[], text, numeric) to service_role;
revoke execute on function public.hosted_internships_for(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
