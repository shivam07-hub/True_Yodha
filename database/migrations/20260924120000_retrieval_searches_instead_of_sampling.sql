-- Retrieval stops sampling and starts searching.
--
-- The authed /market feed picked its candidates with
-- `order(first_seen desc).limit(500)` and filtered them for the user AFTERWARDS.
-- With 88% of the corpus sharing one `first_seen` date, that was an arbitrary
-- 500 rows out of 34,022 — identical for every user on the same filters. One
-- user's entire feed measured 34 jobs out of 38,824 live, and none of the 35 a
-- hand search found for her were reachable at all: Match Quality recall 0%.
--
-- This filters FIRST, over the whole corpus, per user, and ranks what survives.
--
-- MEASURED while building, because every shape here replaced one that failed:
--
--   * a lateral `job_skills` lookup per candidate: 29,562ms, 1,117,150 buffers.
--     Inverted to ONE grouped pass by skill_id: 20,659ms, 40,201 buffers.
--   * `cardinality(bands)=0 or career_band = any(bands)` cannot use an index, so
--     the partial index sat unused at 37,874 buffers. An empty choice now
--     becomes the full set and the predicate is a plain equality.
--   * scalar subqueries defeated the index a second time; PL/pgSQL locals make
--     the value a plan parameter. 21,183 buffers, ~300ms warm — inside the
--     read contract's 500ms.
--   * and the trap READ_PATH_PLAYBOOK warns about: the same filter measured
--     7,468ms cold and 342ms warm. That nearly became a wrong diagnosis about
--     regex cost.
--
-- THE LEVEL RULE is what recall actually turns on. Both sides are a range and
-- they must overlap: the person's is [years-1, years+1] when we know her years
-- and the band's implied span when we do not; the listing's is [min, max] with
-- an unstated bound spanning [0,40].
--
-- Two bugs here were caught by READING THE OUTPUT, not by reasoning:
--   - judging the employer's stated range only when years were known sent
--     NPCI's "Senior Associate, 2-6 years" back to its title word and dropped
--     every payments role she should see;
--   - falling back to no rule at all when years were unknown put an 8-14 year
--     Cisco role and a VP requisition in a 3.2-year candidate's top three.
--
-- Untagged listings stay candidates. 9,323 live listings state no level, and
-- treating that absence as a rejection is what emptied the feed.
--
-- The shape rules are the ones a hand-built shortlist already followed: at most
-- two roles per employer (Honeywell took 7 of the first 12 without it), and one
-- row per (employer, title), because two requisitions with the same title read
-- as one job to a person.
--
-- NOT wired to any surface yet. The feed keeps its 500-row sample until the
-- finite list replaces it in one release; this makes the honest answer
-- available to be measured against the yardstick first.
--
-- The index must be created CONCURRENTLY and so cannot run inside a
-- transaction. It was applied to production separately on 2026-09-24; the
-- statement is kept here, commented, for a fresh environment:
--
--   create index concurrently if not exists idx_jobs_candidate_band
--     on public.jobs (career_band, job_id)
--     where is_active and listing_confidence = 'active' and apply_url is not null;
--
-- Additive and reversible: drop the function and the index.

create or replace function public.candidates_for_user(
    p_user_id uuid,
    p_limit int default 40
)
returns table (
    job_id text, score numeric, overlap int,
    on_direction boolean, level_stated boolean, checked_recently boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
    v_years numeric; v_years_unknown boolean;
    v_families text[]; v_bands text[]; v_countries text[]; v_skills int[];
    v_lo numeric; v_hi numeric;
    v_per_company int := 2;
begin
    select coalesce(p.years_experience, 0)::numeric,
           (p.years_experience is null),
           coalesce(p.target_role_titles, array[]::text[]),
           case when cardinality(coalesce(p.explored_career_bands, array[]::text[])) = 0
                then array['engineering_data','business_product_operations',
                           'research_people_public_impact','design_creative']
                else p.explored_career_bands end,
           coalesce(p.target_location_countries, array[]::text[])
      into v_years, v_years_unknown, v_families, v_bands, v_countries
      from public.user_profiles p where p.id = p_user_id;
    if not found then return; end if;

    if not v_years_unknown then
        v_lo := v_years - 1; v_hi := v_years + 1;
    else
        select lo, hi into v_lo, v_hi from (values
            ('intern', 0, 1), ('entry', 0, 2), ('mid', 2, 5),
            ('senior', 5, 8), ('lead', 8, 12), ('executive', 12, 40)
        ) as b(band, lo, hi)
        where b.band = lower(coalesce(
            (select target_seniority from public.user_profiles where id = p_user_id), ''));
        if v_lo is null then v_lo := 0; v_hi := 40; end if;
    end if;

    select array_agg(us.skill_id) into v_skills
      from public.user_skills us join public.skills s on s.id = us.skill_id
     where us.user_id = p_user_id and coalesce(s.skill_kind, '') <> 'soft';
    v_skills := coalesce(v_skills, array[]::int[]);

    return query
    with overlap as (
        select js.job_id, count(*)::int as hits,
               sum(case when js.is_primary then 2 else 1 end)::numeric as weighted
        from public.job_skills js
        where js.skill_id = any(v_skills)
        group by js.job_id
    ),
    cand as (
        select j.job_id, j.role_family, j.location_country, j.company_name, j.job_title,
               j.min_years_experience as lo, j.max_years_experience as hi,
               j.last_conclusive_verification_at as checked_at, j.ingested_at
        from public.jobs j
        where j.is_active and j.listing_confidence = 'active' and j.apply_url is not null
          and j.career_band = any(v_bands)
          and j.job_title !~* '(intern|trainee|graduate|campus|fresher|apprentice)'
          and coalesce(j.min_years_experience, 0)::numeric <= v_hi
          and coalesce(j.max_years_experience, 40)::numeric >= v_lo
    ),
    scored as (
        select c.job_id, c.company_name, c.job_title,
               (case when c.role_family = any(v_families) then 6 else 0 end
                + coalesce(o.weighted, 0)
                + case when c.checked_at > now() - interval '7 days' then 1 else 0 end
                + case when c.ingested_at > now() - interval '14 days' then 1 else 0 end)::numeric as score,
               coalesce(o.hits, 0)::int as hits,
               (c.role_family = any(v_families)) as on_direction,
               (c.lo is not null or c.hi is not null) as level_stated,
               (c.checked_at > now() - interval '7 days') as checked_recently
        from cand c
        left join overlap o on o.job_id = c.job_id
        where (coalesce(o.hits, 0) > 0 or c.role_family = any(v_families))
          and (cardinality(v_countries) = 0 or c.location_country = any(v_countries))
    ),
    deduped as (
        select s.*, row_number() over (
                 partition by lower(coalesce(s.company_name,'')), lower(coalesce(s.job_title,''))
                 order by s.score desc, s.job_id) as same_title
        from scored s
    ),
    ranked as (
        select d.*, row_number() over (
                 partition by lower(coalesce(d.company_name,''))
                 order by d.score desc, d.job_id) as per_company
        from deduped d where d.same_title = 1
    )
    select r.job_id, r.score, r.hits, r.on_direction, r.level_stated, r.checked_recently
    from ranked r
    where r.per_company <= v_per_company
    order by r.score desc, r.job_id
    limit greatest(p_limit, 0);
end;
$$;

notify pgrst, 'reload schema';
