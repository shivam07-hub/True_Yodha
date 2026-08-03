-- role_family_market_skills — ONE definition of "what does this user's market want".
--
-- Before: the score asked two different questions of two different job sets.
--
--   role_family_aspiration_skills(families)  → the gap's TARGET level, scoped to
--                                              the families the user chose
--   count_job_demand_for_skills(skill_ids)   → the gap's RANKING WEIGHT, over the
--                                              ENTIRE corpus — no family, no
--                                              location, no band
--
-- So a gap could be targeted at L4 because the user's families demand it, while
-- its weight came from a corpus those families are 2% of. The two disagreed by
-- construction, and `compute_gap_skills` multiplies one by the other.
--
-- It also could not physically run. Demand was fetched by sending every key to
-- PostgREST as `taxonomy_key=in.(…)`. Two role families expand to 1,642 keys /
-- 33.5 KB of raw key text, so the GET URL blew past the edge's URI limit and came
-- back as a non-JSON `Bad Request`:
--
--   Scoped market skill demand lookup failed: {'code': 400, 'details': b'Bad Request'}
--
-- That is caught and fail-soft, so demand silently became {} → every gap weighed
-- 0 → the "what to fix first" ordering was arbitrary for every targeted user.
--
-- This function answers both questions from the SAME scoped job set in one pass,
-- and takes the scope (a short family array) rather than the answer keys, so the
-- request body cannot grow with the size of the market. `weighted_demand` keeps
-- count_job_demand_for_skills' weighting exactly (primary ×2, side ×1) so the
-- number means the same thing wherever it is read.
--
-- Job scoping is byte-identical to role_family_aspiration_skills on purpose:
-- these must not drift again. (Whether `is_active`/`listing_confidence` is the
-- right freshness gate is a separate, deliberate decision — see the freshness
-- gate work; do not quietly change it here.)
--
-- Additive: the two functions it supersedes are left in place until the code
-- calling them is deployed.

create or replace function public.role_family_market_skills(p_families text[])
returns table(
    taxonomy_key text,
    primary_job_count integer,
    has_side_skill boolean,
    job_count integer,
    weighted_demand integer
)
language sql
stable
set search_path to 'public'
as $$
    with selected_jobs as (
        select job_id
        from public.jobs
        where role_family = any(coalesce(p_families, array[]::text[]))
          and is_active is true
          and listing_confidence = 'active'
    ), totals as (
        select count(*)::integer as job_count from selected_jobs
    )
    select skill.taxonomy_key,
           count(distinct selected.job_id) filter (where job_skill.is_primary)::integer as primary_job_count,
           bool_or(not job_skill.is_primary) as has_side_skill,
           totals.job_count,
           sum(case when job_skill.is_primary then 2 else 1 end)::integer as weighted_demand
    from selected_jobs as selected
    join public.job_skills as job_skill on job_skill.job_id = selected.job_id
    join public.skills as skill on skill.id = job_skill.skill_id
    cross join totals
    group by skill.taxonomy_key, totals.job_count;
$$;

comment on function public.role_family_market_skills(text[]) is
  'Aspiration target AND weighted demand for one family-scoped job set, in one pass. Supersedes role_family_aspiration_skills + a corpus-wide count_job_demand_for_skills; scope travels as families, never as a key list, so the request cannot outgrow the URL.';

notify pgrst, 'reload schema';
