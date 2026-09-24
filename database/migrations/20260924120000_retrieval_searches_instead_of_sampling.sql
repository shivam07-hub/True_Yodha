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
--     the value a plan parameter. ~165ms, 19,942 buffers — inside the read
--     contract's 500ms, and well inside the 8s `statement_timeout` that
--     `authenticated` carries and no retry can widen.
--   * and three ways to measure nothing, all of which happened here. The same
--     filter read 7,468ms cold and 342ms warm. A `stable` function called with
--     identical arguments is evaluated ONCE per query, so six timed runs in one
--     statement all reported 0ms. And `explain (analyze)` timing instrumentation
--     cost 50x on this shape — 8,584ms with timing on, 165ms with `timing off`,
--     same plan, same buffers. Use `timing off` here and compare buffers.
--
-- THE LEVEL RULE is what reachability turns on. Both sides are a range and they
-- must overlap: the person's is [years-1, years+1] when we know her years and
-- the band's implied span when we do not; the listing's is [min, max] with an
-- unstated bound spanning [0,40].
--
-- Two bugs here were caught by READING THE OUTPUT, not by reasoning:
--   - judging the employer's stated range only when years were known sent
--     NPCI's "Senior Associate, 2-6 years" back to its title word and dropped
--     every payments role she should see;
--   - falling back to no rule at all when years were unknown put an 8-14 year
--     Cisco role and a VP requisition in a 3.2-year candidate's top three.
--
-- ABSENCE IS NOT A REJECTION, and it took two shapes here. 9,323 live listings
-- state no level, and treating that absence as a reject is what emptied the
-- feed. 1,557 state no `career_band` — Airbus's "Full Stack_Python_Pyspark_AWS"
-- and MongoDB's "Associate TSE II" among them — and an equality against an
-- array never matches NULL, so they were invisible to every user alive. A band
-- nobody tagged is a tagger that did not run, not a job in another field: when
-- the role family is one the person chose, the family has already proved
-- relevance and the missing band decides nothing.
--
-- It is a UNION ALL of two index-backed branches, not an `OR`. `career_band =
-- any(...) or (career_band is null and role_family = any(...))` is precisely the
-- predicate the planner cannot prove, and it would have put the whole thing back
-- on a sequential scan — the trap that already cost two rounds here. Two
-- branches, two indexes, +3ms: 139ms -> 142ms warm.
--
-- The shape rules are the ones a hand-built shortlist already followed: at most
-- two roles per employer (Honeywell took 7 of the first 12 without it), and one
-- row per (employer, title), because two requisitions with the same title read
-- as one job to a person.
--
-- WIRED, in the same release that deleted the sample: `GET /jobs/feed` serves this
-- through `JobsRepository.shortlist_jobs`, `POST /feed/warm` ranks the same forty
-- because it calls the same method, and the partner alert payload reads it too —
-- a partner carrying 37% of our users was being handed the same arbitrary slice,
-- and their user never sees the site to notice.
--
-- It also drops what the user already saved or skipped. That kept the draining
-- queue in one place: a finite list that re-offers a decided job spends one of
-- forty places on a question she already answered.
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
    v_lo numeric; v_hi numeric; v_centre numeric;
    v_per_company int := 2;
    v_senior_tags text[] := array['senior','lead','principal','staff','executive','director'];
    v_decided text[];
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
    v_centre := (v_lo + v_hi) / 2;

    select array_agg(us.skill_id) into v_skills
      from public.user_skills us join public.skills s on s.id = us.skill_id
     where us.user_id = p_user_id and coalesce(s.skill_kind, '') <> 'soft';
    v_skills := coalesce(v_skills, array[]::int[]);

    -- The draining queue: a job she saved or skipped has been DECIDED, and a
    -- finite list that re-offers it spends one of forty places on a question she
    -- already answered. Capped at 193 rows for the heaviest account alive, so an
    -- array beats two anti-joins and keeps this one pass.
    --
    -- Every column here is qualified because `job_id` is also an OUT parameter of
    -- this function: unqualified, PL/pgSQL cannot tell them apart and raises
    -- 42702 at runtime, not at create time.
    select coalesce(array_agg(d.jid), array[]::text[]) into v_decided
      from (
        select x.job_id as jid from public.user_dismissed_job_cards x where x.user_id = p_user_id
        union
        select a.job_id as jid from public.job_applications a where a.user_id = p_user_id
      ) d;

    return query
    with pool as (
        select j.job_id as jid, j.role_family, j.location_country, j.company_name,
               j.job_title, j.min_years_experience as lo, j.max_years_experience as hi,
               j.seniority_level as tag,
               j.last_conclusive_verification_at as checked_at, j.ingested_at
        from public.jobs j
        where j.is_active and j.listing_confidence = 'active' and j.apply_url is not null
          and j.career_band = any(v_bands)
      union all
        -- Untagged band, but a family she chose. Disjoint from the branch above,
        -- so UNION ALL cannot duplicate a row.
        select j.job_id, j.role_family, j.location_country, j.company_name,
               j.job_title, j.min_years_experience, j.max_years_experience,
               j.seniority_level,
               j.last_conclusive_verification_at, j.ingested_at
        from public.jobs j
        where j.is_active and j.listing_confidence = 'active' and j.apply_url is not null
          and j.career_band is null and j.role_family = any(v_families)
    ),
    cand as (
        select * from pool p
        where p.job_title !~* '(intern|trainee|graduate|campus|fresher|apprentice)'
          and coalesce(p.lo, 0)::numeric <= v_hi
          and coalesce(p.hi, 40)::numeric >= v_lo
          -- The employer's range wins over any tag — but only where there IS
          -- one. Where the employer states nothing, the tag is the only signal
          -- in the listing, and ignoring it put nine senior roles in a 3.5-year
          -- list. Dropping the tag entirely was an over-correction for the
          -- opposite bug, where a title word overruled a stated "2-6 years".
          and not (p.lo is null and p.hi is null
                   and lower(coalesce(p.tag, '')) = any(v_senior_tags)
                   and v_centre < 5)
          and not (p.jid = any(v_decided))
    ),
    -- Weighted by whether the listing calls the skill a must-have, and NOT by
    -- how rare the skill is. Rarity weighting (ln(corpus/document frequency))
    -- was built and measured here on 2026-09-24: recall against the yardstick
    -- moved 20% -> 18% while warm latency went 139ms -> 1,108ms. It made the
    -- top of the list look better to a human eye, which is not evidence. If it
    -- is tried again, measure recall first and keep it only if the number moves.
    overlap as (
        select js.job_id as jid, count(*)::int as n_hits,
               sum(case when js.is_primary then 2 else 1 end)::numeric as weighted
        from public.job_skills js
        where js.skill_id = any(v_skills)
        group by js.job_id
    ),
    scored as (
        select c.jid, c.company_name, c.job_title,
               (case when c.role_family = any(v_families) then 6 else 0 end
                + coalesce(o.weighted, 0)
                + case when c.checked_at > now() - interval '7 days' then 1 else 0 end
                + case when c.ingested_at > now() - interval '14 days' then 1 else 0 end)::numeric as sc,
               coalesce(o.n_hits, 0)::int as n_hits,
               (c.role_family = any(v_families)) as on_dir,
               (c.lo is not null or c.hi is not null) as lvl_stated,
               (c.checked_at > now() - interval '7 days') as chk
        from cand c
        left join overlap o on o.jid = c.jid
        where (coalesce(o.n_hits, 0) > 0 or c.role_family = any(v_families))
          and (cardinality(v_countries) = 0 or c.location_country = any(v_countries))
    ),
    deduped as (
        select s.*, row_number() over (
                 partition by lower(coalesce(s.company_name,'')), lower(coalesce(s.job_title,''))
                 order by s.sc desc, s.jid) as same_title
        from scored s
    ),
    ranked as (
        select d.*, row_number() over (
                 partition by lower(coalesce(d.company_name,''))
                 order by d.sc desc, d.jid) as per_company
        from deduped d where d.same_title = 1
    )
    select r.jid, r.sc, r.n_hits, r.on_dir, r.lvl_stated, r.chk
    from ranked r
    where r.per_company <= v_per_company
    order by r.sc desc, r.jid
    limit greatest(p_limit, 0);
end;
$$;

-- Invoker rights, and not executable by anon. RLS on `user_profiles` is what makes
-- the `p_user_id` argument safe: called as anyone but its owner, the profile read
-- finds nothing and the function returns an empty list rather than that person's
-- matches. `anon` had EXECUTE by default, which is a hole that degraded quietly
-- rather than loudly.
revoke all on function public.candidates_for_user(uuid, int) from public, anon;
grant execute on function public.candidates_for_user(uuid, int) to authenticated, service_role;

comment on function public.candidates_for_user(uuid, int) is
'The finite /market list: filters the whole corpus for one user and ranks what survives. Invoker rights on purpose — RLS on user_profiles means passing someone else another person''s id returns nothing rather than their matches.';

notify pgrst, 'reload schema';
