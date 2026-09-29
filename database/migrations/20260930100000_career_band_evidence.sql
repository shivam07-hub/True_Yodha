-- The Field card says WHY a field is yours, with its denominator.
--
-- `career_band_options` already joined the caller's CV skills against every
-- band to compute `fit` — and used it only to sort. The card printed two corpus
-- totals ("20,659 open · 154 directions"), which say how big a field is and
-- nothing about the person choosing it.
--
-- Evidence is NOT the fit weights. Generic skills carry a trace weight in almost
-- every family, so ranking by weight gave Design & Creative (fit 0.56) the same
-- three names as a field the person genuinely fits. A skill counts for a band
-- only when it is one of the TWELVE a family in that band most demands —
-- `role_family_labels.core_skills`, the vocabulary Direction Fit already grades
-- against. Measured on one real CV: 18 of 34 skills asked in Business, 2 in
-- Design & Creative. The count carries the strength; the names carry the why.
--
-- NULL (not 0) when the caller has no CV skills: "we could not read it" is not
-- "nothing of yours is asked here", and the card must not say the second.
--
-- Cost, measured warm at the heaviest CV (73 skills): 9.3ms before, the evidence
-- half 4.6ms on top, same single round trip. `fit` and the card order are
-- unchanged.
--
-- The return type grows, so the function is dropped and recreated in this one
-- migration. Production's `main` reads four columns through a response model
-- that drops unknown keys, and the onboarding payload passes dicts through, so
-- the extra columns are invisible to it until the frontend ships.

drop function if exists public.career_band_options(integer[]);

create function public.career_band_options(
  p_skill_ids integer[] default array[]::integer[]
)
returns table (
  band           text,
  job_count      integer,
  family_count   integer,
  fit            numeric,
  cv_skill_count integer,
  matched_count  integer,
  matched_skills text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with canonical(band) as (
    values ('engineering_data'), ('business_product_operations'),
           ('research_people_public_impact'), ('design_creative')
  ), band_fit as (
    -- Unchanged from 20260913100000. The parameter is read directly rather than
    -- through a CTE: a CTE referenced twice is materialised, the planner loses
    -- the array's size, and the labels join flips to a 2,709-loop nested scan.
    select b.band, sum(w.weight::numeric / greatest(l.weight_norm::numeric, 0.000001)) as fit
    from public.role_family_skill_weights w
    join public.role_family_labels l on l.family = w.family
    cross join lateral unnest(l.bands) as b(band)
    where w.skill_id = any(coalesce(p_skill_ids, array[]::integer[]))
    group by b.band
  ), mine as (
    select distinct sk.display_name
    from public.skills sk
    where sk.id = any(coalesce(p_skill_ids, array[]::integer[]))
      and nullif(btrim(sk.display_name), '') is not null
  ), asked as (
    select b.band, c.skill, count(distinct l.family) as families
    from public.role_family_labels l
    cross join lateral unnest(l.bands) as b(band)
    cross join lateral unnest(l.core_skills) as c(skill)
    join mine m on m.display_name = c.skill
    group by b.band, c.skill
  ), evidence as (
    -- Most widely asked first: a skill five families in the band demand says
    -- more about the field than one that a single family does.
    select a.band,
           count(*)::integer as matched_count,
           (array_agg(a.skill order by a.families desc, a.skill asc))[1:3] as matched_skills
    from asked a
    group by a.band
  ), cv as (
    select count(*)::integer as n from mine
  )
  select k.band,
         coalesce(s.job_count, 0)    as job_count,
         coalesce(s.family_count, 0) as family_count,
         round(coalesce(f.fit, 0), 4) as fit,
         nullif(cv.n, 0)              as cv_skill_count,
         case when cv.n = 0 then null else coalesce(e.matched_count, 0) end as matched_count,
         case when cv.n = 0 then null else coalesce(e.matched_skills, array[]::text[]) end as matched_skills
  from canonical k
  cross join cv
  left join public.career_band_scope s on s.band = k.band
  left join band_fit f on f.band = k.band
  left join evidence e on e.band = k.band
  order by round(coalesce(f.fit, 0), 4) desc, coalesce(s.job_count, 0) desc, k.band asc;
$$;

revoke all on function public.career_band_options(integer[]) from public;
grant execute on function public.career_band_options(integer[]) to anon, authenticated, service_role;
