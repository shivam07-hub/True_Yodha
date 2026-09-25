-- The direction term stops reading the bucket.
--
-- ADR-0022: jobs.role_family may decide which rows are worth looking at. It
-- must not decide whether a job fits, and it must not add rank for fitting.
-- candidates_for_user was doing both: on_direction was role_family equality,
-- and the score added 6 for the same equality. A gold-loan branch-sales
-- posting filed in "Marketing Strategy and Techniques" then ranked and tagged
-- as that direction.
--
-- Recall is unchanged: the untagged-band branch and the
-- `n_hits > 0 or role_family = any(v_families)` filter. The score is skill
-- overlap and freshness. The +6 and the card tag are applied in
-- shortlist_jobs from direction_fit.grade, whose inputs (main_skills, the
-- direction's core_skills) are already in memory for the rows returned here.
-- That is not the corpus-wide role_family_pool snapshot, which stays behind
-- the paid-compute gate.
--
-- Additive and reversible: the previous function body is the migration this
-- replaces. Restoring it puts the bucket back into the score and the tag.

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
               -- Direction is not a term here. role_family equality is recall
               -- (the filter below, and the untagged-band branch). The +6 is
               -- applied in shortlist_jobs from direction_fit.grade, on the
               -- rows this function already returned.
               (coalesce(o.weighted, 0)
                + case when c.checked_at > now() - interval '7 days' then 1 else 0 end
                + case when c.ingested_at > now() - interval '14 days' then 1 else 0 end)::numeric as sc,
               coalesce(o.n_hits, 0)::int as n_hits,
               -- Null on purpose. A bucket equality is not a verdict; the
               -- card's on_direction is graded in Python. Keeping the column
               -- holds the return type stable for CREATE OR REPLACE.
               null::boolean as on_dir,
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
'The finite /market list: filters the whole corpus for one user and ranks what survives by skill overlap and freshness. role_family is the recall index only — the direction verdict and its ranking term are graded in shortlist_jobs. Invoker rights on purpose — RLS on user_profiles means passing someone else another person''s id returns nothing rather than their matches.';

notify pgrst, 'reload schema';
