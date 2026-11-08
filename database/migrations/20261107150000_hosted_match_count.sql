-- How many people already on Myro a paid internship would reach: the
-- recruiter's first result, shown while she writes the post, before she has
-- an account. Two numbers, because "people on Myro" is not who will see it:
-- matched = real seekers (test accounts excluded) who want this city (any city
-- for a remote role) and hold at least one of the listed skills (any skill
-- when none are listed); active_30d = those of them who were here in the last
-- 30 days (user_profiles.last_active_at, real since 2026-10-03).
--
-- Counts only, never rows. Called by the backend with the service role; anon
-- and authenticated cannot call it through PostgREST.
--
-- Reversible:
--   drop function if exists public.hosted_match_count(text, boolean, text[]);
--   drop index if exists public.idx_skills_lower_display_name;
--   drop index if exists public.idx_skills_lower_bare_name;

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
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_names text[];
  v_ids integer[];
begin
  select coalesce(array_agg(lower(trim(x))), '{}') into v_names
  from unnest(coalesce(p_skills, '{}')) as x
  where trim(x) <> '';

  -- An on-site or hybrid role with no city reaches no one we can name.
  if not p_remote and v_city is null then
    return query select 0, 0;
    return;
  end if;

  -- Resolve names to ids first (the planner cannot see through a parameter
  -- list; with literals the count is ~7ms, as one SQL body it was ~600ms).
  -- Full name or the bare pre-parenthetical form, the rule the JD skill
  -- extractor uses (skill_extraction._skill_terms): "SQL" finds
  -- "SQL (Programming Language)".
  if cardinality(v_names) > 0 then
    select coalesce(array_agg(s.id), '{}') into v_ids
    from public.skills s
    where lower(s.display_name) = any(v_names)
       or lower(trim(split_part(s.display_name, '(', 1))) = any(v_names);
    if cardinality(v_ids) = 0 then
      return query select 0, 0;
      return;
    end if;
  end if;

  return query
  select
    count(*)::integer,
    (count(*) filter (where p.last_active_at > now() - interval '30 days'))::integer
  from public.user_profiles p
  where coalesce(p.is_test_account, false) = false
    and exists (
      select 1 from public.user_skills us
      where us.user_id = p.id
        and (v_ids is null or us.skill_id = any(v_ids))
    )
    and (
      p_remote
      or p.target_location ilike '%' || v_city || '%'
      or exists (
        select 1 from unnest(coalesce(p.target_locations, '{}')) as t
        where t ilike '%' || v_city || '%'
      )
    );
end;
$$;

-- The name lookup probes these instead of scanning 35k skills (66ms warm).
create index if not exists idx_skills_lower_display_name
  on public.skills (lower(display_name));
create index if not exists idx_skills_lower_bare_name
  on public.skills (lower(trim(split_part(display_name, '(', 1))));

revoke execute on function public.hosted_match_count(text, boolean, text[]) from public, anon, authenticated;

notify pgrst, 'reload schema';
