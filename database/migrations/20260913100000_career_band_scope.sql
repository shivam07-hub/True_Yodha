-- The Career Band, asked rather than inferred — and counted from a snapshot.
--
-- S3 of the Direction programme (BACKLOG #46) asks the band during onboarding and
-- shows how much work sits in each. The count is the part that cannot be read live.
-- MEASURED on prod 2026-09-13:
--
--   group by career_band over live jobs      14,393 ms cold / 7,080 ms warm
--                                            (bitmap heap scan, 12,497 blocks read)
--   the same rollup from role_family_labels      58 ms  -- but WRONG: a family may
--                                            sit in two bands (ADR-0022), so summing
--                                            open_count gives 57,512 against 41,417
--                                            real banded jobs, a 39% over-count.
--
-- So the four totals become a Tier-0 snapshot, computed inside the refresh that
-- already scans these rows for `role_family_labels.bands`. The scan is reused, not
-- repeated: the same `banded` CTE feeds the per-family band array and the four band
-- totals. Nothing new is read per ingest.
--
-- WHY A JOB COUNT AND A FAMILY COUNT. A band with 235 directions and one with 8 are
-- not the same offer even at similar job counts, and Design & Creative is the live
-- case: 8 families, against Engineering & Data's 235. The band step shows both so a
-- nearly-empty band reads as what it is instead of as a fourth equal card.

create table if not exists public.career_band_scope (
  band         text        not null primary key,
  job_count    integer     not null,
  family_count integer     not null,
  refreshed_at timestamptz not null
);

comment on table public.career_band_scope is
  'Tier-0 snapshot: live jobs and distinct directions per Career Band. Four rows. '
  'Counted from jobs.career_band in refresh_role_family_labels(), which already '
  'scans these rows for role_family_labels.bands. A live group-by costs 7s warm on '
  'this instance; this read is an index scan of four rows. See migration 20260913100000.';

alter table public.career_band_scope enable row level security;
drop policy if exists "career band scope is public" on public.career_band_scope;
create policy "career band scope is public" on public.career_band_scope for select using (true);

-- The refresh gains the four totals, from the scan it was already doing. The two
-- band UPDATEs and the new INSERT now hang off ONE `banded` CTE rather than each
-- re-reading `public.jobs`; everything above the band block is unchanged.
create or replace function public.refresh_role_family_labels()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now      timestamptz := now();
  v_rows     integer;
  v_weights  integer;
  v_profile  integer;
  v_bands    integer;
begin
  with live_jobs as (
    select job_id, role_family, job_title
    from public.jobs
    where role_family is not null and is_active is true and listing_confidence = 'active'
  ), family_counts as (
    select role_family as family, count(*)::integer as open_count from live_jobs group by role_family
  ), cleaned_titles as (
    select role_family as family,
           btrim(regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(job_title, '^[[:space:]]*(RB-LS:|Branch:)[[:space:]]*', '', 'i'),
                 '[[:space:]]+L[1-5][[:space:]]*$', '', 'i'),
               '([[:space:]]*-[[:space:]]*Sales){2,}[[:space:]]*$', '', 'i'),
             '[[:space:]]+', ' ', 'g')) as cleaned_title
    from live_jobs where nullif(btrim(job_title), '') is not null
  ), title_counts as (
    select family, cleaned_title, count(*) as title_count
    from cleaned_titles where cleaned_title <> '' group by family, cleaned_title
  ), labels as (
    select family, cleaned_title as label,
           row_number() over (partition by family order by title_count desc, cleaned_title asc) as label_rank
    from title_counts
  ), fresh as (
    select c.family, l.label, c.open_count
    from family_counts c join labels l on l.family = c.family and l.label_rank = 1
  ), upserted as (
    insert into public.role_family_labels (family, label, open_count, refreshed_at, is_catch_all)
    select f.family, f.label, f.open_count, v_now,
           (f.family like 'General %' or f.family like 'Other %'
            or f.family in ('Business Operations','Business Management','Business Solutions',
                            'Business Leadership','Business Continuity','Computer Science',
                            'Administrative Support and Clerical Tasks',
                            'Office and Productivity Equipment and Technology',
                            'Scripting Languages','Query Languages'))
    from fresh f
    on conflict (family) do update
      set label = excluded.label, open_count = excluded.open_count, refreshed_at = excluded.refreshed_at
    returning family
  )
  select count(*)::integer into v_rows from upserted;

  delete from public.role_family_labels where refreshed_at <> v_now;

  delete from public.role_family_skill_weights;

  with live_jobs as (
    select job_id, role_family from public.jobs
    where role_family is not null and is_active is true and listing_confidence = 'active'
  ), fam_skill as (
    select lj.role_family as family, js.skill_id,
           sum(case when js.is_primary then 2 else 1 end)::numeric as demand
    from live_jobs lj join public.job_skills js on js.job_id = lj.job_id
    group by lj.role_family, js.skill_id
  ), family_total as (
    select role_family as family, count(*)::numeric as jobs from live_jobs group by role_family
  ), corpus as (select count(distinct family)::numeric as families from fam_skill),
  idf as (
    select fs.skill_id, ln((select families from corpus) / count(*)::numeric) as idf
    from fam_skill fs group by fs.skill_id
  ), inserted as (
    insert into public.role_family_skill_weights (family, skill_id, weight)
    select fs.family, fs.skill_id, ((fs.demand / ft.jobs) * i.idf)::real
    from fam_skill fs join family_total ft on ft.family = fs.family join idf i on i.skill_id = fs.skill_id
    where i.idf > 0
    returning 1
  )
  select count(*)::integer into v_weights from inserted;

  update public.role_family_labels snap
  set weight_norm = coalesce(agg.norm, 0), top_skills = coalesce(agg.names, array[]::text[])
  from (
    select w.family, sqrt(sum(w.weight::numeric * w.weight::numeric))::real as norm,
           (array_agg(sk.display_name order by w.weight desc, sk.display_name asc))[1:8] as names
    from public.role_family_skill_weights w join public.skills sk on sk.id = w.skill_id
    where nullif(btrim(sk.display_name), '') is not null
    group by w.family
  ) agg
  where agg.family = snap.family;

  update public.role_family_labels
  set weight_norm = 0, top_skills = array[]::text[]
  where family not in (select family from public.role_family_skill_weights);

  -- Bands: every band holding >= 25% of the family's banded jobs (ADR-0022 one level
  -- up), AND the four band totals, from one scan of the banded live jobs.
  delete from public.career_band_scope;

  with banded as (
    select role_family as family, career_band, count(*)::integer as n
    from public.jobs
    where is_active is true and listing_confidence = 'active'
      and role_family is not null and career_band is not null
    group by role_family, career_band
  ), shares as (
    select family, career_band, n, sum(n) over (partition by family) as tot from banded
  ), keep as (
    select family, array_agg(career_band order by n desc) as bands
    from shares where n::numeric / tot >= 0.25 group by family
  ), set_bands as (
    update public.role_family_labels snap
    set bands = k.bands
    from keep k where k.family = snap.family
    returning 1
  ), clear_bands as (
    update public.role_family_labels
    set bands = array[]::text[]
    where family not in (select family from banded)
    returning 1
  ), band_jobs as (
    select career_band as band, sum(n)::integer as job_count from banded group by career_band
  ), band_families as (
    -- Counted from `keep`, NOT from `banded`. A family with one stray job in a band
    -- is not a direction in that band, and the band step's count has to mean the
    -- same thing `p_bands` filters on (>= 25%), or the card promises 71 directions
    -- and the next screen offers 8. That is the live gap for Design & Creative.
    select b.band, count(*)::integer as family_count
    from keep k cross join lateral unnest(k.bands) as b(band)
    group by b.band
  ), band_rows as (
    insert into public.career_band_scope (band, job_count, family_count, refreshed_at)
    select j.band, j.job_count, coalesce(fam.family_count, 0), v_now
    from band_jobs j left join band_families fam on fam.band = j.band
    returning 1
  )
  select count(*)::integer into v_bands from band_rows;

  -- The profile. Scope first: it is the denominator and the profile's parent.
  delete from public.role_family_profile;
  delete from public.role_family_scope;

  insert into public.role_family_scope (family, seniority, job_count)
  select j.role_family,
         coalesce(nullif(public.canonical_source_seniority(j.seniority_level), ''), 'unknown'),
         count(*)::integer
  from public.jobs j
  where j.role_family is not null and j.is_active is true and j.listing_confidence = 'active'
    and exists (select 1 from public.role_family_labels l where l.family = j.role_family)
  group by 1, 2;

  with live as (
    select j.job_id, j.role_family family,
           coalesce(nullif(public.canonical_source_seniority(j.seniority_level), ''), 'unknown') seniority
    from public.jobs j
    where j.role_family is not null and j.is_active is true and j.listing_confidence = 'active'
      and exists (select 1 from public.role_family_labels l where l.family = j.role_family)
  ), rows_in as (
    insert into public.role_family_profile
      (family, seniority, skill_id, jobs_with_skill, jobs_must_have, weighted_demand)
    select l.family, l.seniority, js.skill_id,
           count(*)::integer,
           count(*) filter (where coalesce(js.required_level, 2) >= 4)::integer,
           sum(coalesce(js.required_level, 2))::integer
    from live l join public.job_skills js on js.job_id = l.job_id
    group by l.family, l.seniority, js.skill_id
    returning 1
  )
  select count(*)::integer into v_profile from rows_in;

  return jsonb_build_object(
    'families', v_rows, 'skill_weights', v_weights,
    'profile_rows', v_profile, 'bands', v_bands, 'refreshed_at', v_now
  );
end;
$$;

revoke all on function public.refresh_role_family_labels() from public;
grant execute on function public.refresh_role_family_labels() to service_role;

-- The band step's ONE read: what each band holds, and how well the caller's own
-- skills fit it. MEASURED 9.2ms on prod for a 15-skill caller — index-only on
-- `role_family_skill_weights(skill_id)`, then the 337-row label snapshot.
--
-- Fit is the same quantity the family ranking uses (covered weight over the
-- family's norm), rolled up to the band. It orders the four cards; it is never
-- shown as a number, because a band is not a score.
--
-- All four bands always come back, fit 0 included. The step asks which bands the
-- person wants, and a band Myro cannot evidence from the CV is exactly the answer
-- it must not withhold: a CV-derived band matches the user's own choice only 62.4%
-- of the time (BACKLOG #46), which is why this is asked at all.
create or replace function public.career_band_options(
  p_skill_ids integer[] default array[]::integer[]
)
returns table (
  band         text,
  job_count    integer,
  family_count integer,
  fit          numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with canonical(band) as (
    values ('engineering_data'), ('business_product_operations'),
           ('research_people_public_impact'), ('design_creative')
  ), caller as (
    select coalesce(p_skill_ids, array[]::integer[]) as skill_ids
  ), band_fit as (
    select b.band, sum(w.weight::numeric / greatest(l.weight_norm::numeric, 0.000001)) as fit
    from public.role_family_skill_weights w
    cross join caller c
    join public.role_family_labels l on l.family = w.family
    cross join lateral unnest(l.bands) as b(band)
    where w.skill_id = any(c.skill_ids)
    group by b.band
  )
  select k.band,
         coalesce(s.job_count, 0)    as job_count,
         coalesce(s.family_count, 0) as family_count,
         round(coalesce(f.fit, 0), 4) as fit
  from canonical k
  left join public.career_band_scope s on s.band = k.band
  left join band_fit f on f.band = k.band
  order by round(coalesce(f.fit, 0), 4) desc, coalesce(s.job_count, 0) desc, k.band asc;
$$;

revoke all on function public.career_band_options(integer[]) from public;
grant execute on function public.career_band_options(integer[]) to anon, authenticated, service_role;

-- `list_role_families` gains `p_bands` — SUGGESTIONS ONLY.
--
-- Once someone has said which bands they want, proposing directions from outside
-- them is noise: 56.4% of users currently see suggestions spanning two or more
-- bands. But the SEARCH branch and the RESTORE branch ignore `p_bands` entirely,
-- and that is the whole point. Seven of the fourteen most recent people to finish
-- Direction chose a family that was never suggested to them; they got there through
-- the search box. Scoping that box to the bands they had just picked would close the
-- door that rescued half of them. A family found outside your bands is a signal that
-- your bands were wrong, and the client adds the band rather than refusing the pick.
drop function if exists public.list_role_families(integer[], text, integer, text[]);

create or replace function public.list_role_families(
  p_skill_ids integer[] default array[]::integer[],
  p_query     text      default null,
  p_limit     integer   default 6,
  p_families  text[]    default null,
  p_bands     text[]    default null
)
returns table (
  family              text,
  label               text,
  open_count          integer,
  matched_skill_count integer,
  top_skills          text[],
  matched_skills      text[],
  is_catch_all        boolean,
  bands               text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select coalesce(p_skill_ids, array[]::integer[]) as skill_ids
  ), matched as (
    select w.family, w.weight, sk.display_name
    from public.role_family_skill_weights w
    join public.skills sk on sk.id = w.skill_id
    cross join caller c
    where w.skill_id = any(c.skill_ids)
      and nullif(btrim(sk.display_name), '') is not null
  ), fit as (
    select m.family,
           count(*)::integer as matched_skill_count,
           sum(m.weight::numeric) as covered,
           (array_agg(m.display_name order by m.weight desc, m.display_name asc))[1:6] as names
    from matched m
    group by m.family
  )
  select snap.family,
         snap.label,
         snap.open_count,
         coalesce(f.matched_skill_count, 0) as matched_skill_count,
         snap.top_skills,
         coalesce(f.names, array[]::text[]) as matched_skills,
         snap.is_catch_all,
         -- Which bands this direction belongs to, so a pick made through the
         -- (deliberately unscoped) search box can WIDEN the person's chosen
         -- fields instead of being refused by them.
         snap.bands
  from public.role_family_labels snap
  left join fit f on f.family = snap.family
  where case
    when p_families is not null then snap.family = any(p_families)
    when nullif(btrim(p_query), '') is not null then snap.label ilike '%' || btrim(p_query) || '%'
                                                  or snap.family ilike '%' || btrim(p_query) || '%'
    else coalesce(f.matched_skill_count, 0) >= 1 and snap.weight_norm > 0
         -- Chosen bands narrow the SUGGESTIONS only. A family in no band at all
         -- (19 of them, 46 live jobs between them) stays out of a banded
         -- suggestion list and reachable through search, which is where a
         -- direction nobody can band belongs.
         and (p_bands is null or snap.bands && p_bands)
  end
  order by
    -- Typed query: they already named it, so rank by inventory. Restore: the
    -- caller re-orders into the user's own order. Suggestion: fit x volume.
    case when nullif(btrim(p_query), '') is not null or p_families is not null
         then snap.open_count::numeric
         else (coalesce(f.covered, 0) / greatest(snap.weight_norm::numeric, 0.000001))
              * ln(1 + snap.open_count)
    end desc,
    snap.open_count desc,
    snap.family asc
  limit greatest(1, least(coalesce(p_limit, 6), 50));
$$;

revoke all on function public.list_role_families(integer[], text, integer, text[], text[]) from public;
grant execute on function public.list_role_families(integer[], text, integer, text[], text[])
  to anon, authenticated, service_role;

-- THE ANSWER MOVES INTO ONE COLUMN.
--
-- `explored_career_bands` used to hold the bands OTHER than the primary, and was
-- rewritten from target-role titles on every save. Both change: it now holds the
-- whole explicit answer, the primary first, and only an explicit pick writes it
-- (`chosen_bands_for_profile`). That is what makes "nobody has been asked" (empty)
-- readable apart from "chose exactly one band" — the Direction journey's landing
-- rule turns on that difference.
--
-- So rows written under the old meaning need their primary put back at the front,
-- or the ten users who have one would silently lose their MAIN band from the feed
-- the moment the new reader takes over. 15 profiles carry explored bands; 10 were
-- missing their primary. Additive: it only restores a band those users were
-- already being shown.
update public.user_profiles
set explored_career_bands = array[target_career_band] || explored_career_bands
where coalesce(array_length(explored_career_bands, 1), 0) > 0
  and target_career_band is not null
  and not (explored_career_bands @> array[target_career_band]);

-- A fresh environment builds every snapshot here. PROD was NOT rebuilt by this
-- migration: `role_family_labels.bands` was already correct from 20260912100000,
-- so only the new four-row table needed its first fill, and it was seeded with the
-- same `banded` aggregate alone (one 7s scan) rather than paying a full Tier-0
-- rebuild of 124,229 profile rows on the shared Nano instance for four rows. The
-- next ingest refresh recomputes it from this function as normal.
select public.refresh_role_family_labels();

-- THE ANSWER MOVES INTO ONE COLUMN.
--
-- `explored_career_bands` used to hold the bands OTHER than the primary, and was
-- rewritten from target-role titles on every save. Both change: it now holds the
-- whole explicit answer, the primary first, and only an explicit pick writes it
-- (`chosen_bands_for_profile`). That is what makes "nobody has been asked" (empty)
-- readable apart from "chose exactly one band" — the Direction journey's landing
-- rule turns on that difference.
--
-- So rows written under the old meaning need their primary put back at the front,
-- or the ten users who have one would silently lose their MAIN band from the feed
-- the moment the new reader takes over. 15 profiles carry explored bands; 10 were
-- missing their primary. Additive: it only restores a band those users were
-- already being shown.
update public.user_profiles
set explored_career_bands = array[target_career_band] || explored_career_bands
where coalesce(array_length(explored_career_bands, 1), 0) > 0
  and target_career_band is not null
  and not (explored_career_bands @> array[target_career_band]);

-- A fresh environment builds every snapshot here. PROD was NOT rebuilt by this
-- migration: `role_family_labels.bands` was already correct from 20260912100000,
-- so only the new four-row table needed its first fill, and it was seeded with the
-- same `banded` aggregate alone (one 7s scan) rather than paying a full Tier-0
-- rebuild of 124,229 profile rows on the shared Nano instance for four rows. The
-- next ingest refresh recomputes it from this function as normal.
select public.refresh_role_family_labels();

notify pgrst, 'reload schema';
