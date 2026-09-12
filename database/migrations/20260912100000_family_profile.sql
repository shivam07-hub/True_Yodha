-- The Family Profile: one snapshot answers what a direction demands.
--
-- Three live scans answered that question, each rebuilding the same aggregate per
-- request. MEASURED on prod 2026-09-11:
--
--   role_family_market_skills(2 families)        4,311 ms   /skills/role-standing
--                                                           (Settings chips, Upskilling),
--                                                           every Match Run, every recompute
--   role_family_band_market_skills(1, band)      2,833 ms   Career Path, x3 concurrently
--   role_family_aspiration_skills                    --     zero callers, still defined
--
-- One Tier-0 snapshot replaces all three. Counts are stored, never ratios, so a
-- union of up to five families and any seniority band add up from the same rows —
-- one grain answers "family", "families", and "family at this level".
--
-- IS_PRIMARY IS NOT READ. SKILL_ENGINE.md Lock 4 retires it, and the corpus shows
-- why: for Stage A rows `is_primary` is exactly `required_level = 4` restated
-- (211,116 level-4 rows are 100% primary; 283,766 level-2 rows are 0%). On the
-- 296,886 legacy enrichment rows it is a constant instead — 94.7% true, "Ingenuity"
-- and "Global Perspective" included. Reading `required_level` keeps every honest
-- signal and drops the constant, with no backfill and nothing deleted: enrichment
-- stopped writing skills on 20260807b (0 rows after id 1,000,000; newest ingest in
-- that cohort 2026-07-28) so the pool is closed and drains as listings close.
--
-- THE TARGET-LEVEL RULE, WRITTEN ONCE. `get_role_family_market` and its own
-- docstring disagreed — the doc said a skill needs 25% of jobs to reach L3, the
-- code gave L3 to a skill that was primary in a single job. The rule is:
--
--     must-have in > 50% of the family's jobs   -> target level 4
--     must-have in at least one                 -> target level 3
--     present at all                            -> target level 2
--
-- which is today's shape with `required_level >= 4` standing in for `is_primary`.
-- The rule lives in `role_family_demand`'s callers, computed from these counts.

create table if not exists public.role_family_scope (
  family     text    not null references public.role_family_labels(family) on delete cascade,
  seniority  text    not null,
  job_count  integer not null,
  primary key (family, seniority)
);

comment on table public.role_family_scope is
  'Tier-0 snapshot: how many live jobs a family holds at each canonical seniority. '
  'The denominator every share is computed against. Seniority is never NULL here — '
  'jobs with no readable seniority are stored as ''unknown'', so a caller filtering '
  'on a band cannot silently match NULL. See migration 20260912100000.';

create table if not exists public.role_family_profile (
  family           text     not null,
  seniority        text     not null,
  skill_id         integer  not null,
  jobs_with_skill  integer  not null,
  jobs_must_have   integer  not null,
  weighted_demand  integer  not null,
  primary key (family, seniority, skill_id),
  foreign key (family, seniority) references public.role_family_scope (family, seniority) on delete cascade
);

create index if not exists idx_role_family_profile_scope
  on public.role_family_profile (family, seniority) include (skill_id, jobs_with_skill, jobs_must_have, weighted_demand);

comment on table public.role_family_profile is
  'Tier-0 snapshot: what each role family demands, per seniority, per skill. '
  'Counts, never ratios, so unions of families and bands sum from these rows. '
  '`jobs_must_have` counts required_level >= 4 — the must-have zone Stage A reads '
  'from the posting. `is_primary` is deliberately not represented (Lock 4). '
  'Refreshed by refresh_role_family_labels(). See migration 20260912100000.';

alter table public.role_family_scope   enable row level security;
alter table public.role_family_profile enable row level security;

drop policy if exists "role family scope is public" on public.role_family_scope;
create policy "role family scope is public" on public.role_family_scope for select using (true);
drop policy if exists "role family profile is public" on public.role_family_profile;
create policy "role family profile is public" on public.role_family_profile for select using (true);

-- Every band holding at least a quarter of the family's banded jobs. A direction is
-- not forced into one band for the same reason a job is not forced into one family
-- (ADR-0022): CRM is genuinely both business and engineering work. Measured
-- 2026-09-12: 212 directions land in one band, 95 in two, 4 in three, and 19 in none
-- — those 19 hold 46 live jobs between them and stay reachable through search.
alter table public.role_family_labels
  add column if not exists bands text[] not null default array[]::text[];

comment on column public.role_family_labels.bands is
  'Career Bands holding >= 25% of this family''s banded live jobs. Drives which '
  'directions are suggested once a user has chosen their bands; search ignores it.';

-- The refresh gains three steps. Same lease, same ingest cadence, one more pass over
-- the live corpus: measured 12.6s for the profile aggregate on top of the 3.1s the
-- weights already cost. Both are off the request path.
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

  -- Bands: every band holding >= 25% of the family's banded jobs (ADR-0022 one level up).
  update public.role_family_labels snap
  set bands = coalesce(b.bands, array[]::text[])
  from (
    select family, array_agg(career_band order by n desc) bands
    from (
      select role_family as family, career_band, count(*) n,
             sum(count(*)) over (partition by role_family) tot
      from public.jobs
      where is_active is true and listing_confidence = 'active'
        and role_family is not null and career_band is not null
      group by role_family, career_band
    ) z where n::numeric / tot >= 0.25
    group by family
  ) b
  where b.family = snap.family;

  update public.role_family_labels set bands = array[]::text[]
  where family not in (
    select role_family from public.jobs
    where is_active is true and listing_confidence = 'active'
      and role_family is not null and career_band is not null);

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
    'profile_rows', v_profile, 'refreshed_at', v_now
  );
end;
$$;

revoke all on function public.refresh_role_family_labels() from public;
grant execute on function public.refresh_role_family_labels() to service_role;

-- ONE reader replaces role_family_market_skills AND role_family_band_market_skills.
-- `p_seniority` null = the whole family; a band name = that band only. Counts sum
-- across families and across seniorities from the same rows, which is why the
-- snapshot stores counts rather than the shares each caller wants.
create or replace function public.role_family_demand(
  p_families  text[],
  p_seniority text default null
)
returns table (
  taxonomy_key    text,
  jobs_with_skill integer,
  jobs_must_have  integer,
  job_count       integer,
  weighted_demand integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select coalesce(sum(s.job_count), 0)::integer job_count
    from public.role_family_scope s
    where s.family = any(coalesce(p_families, array[]::text[]))
      and (p_seniority is null or s.seniority = p_seniority)
  )
  select sk.taxonomy_key,
         sum(p.jobs_with_skill)::integer,
         sum(p.jobs_must_have)::integer,
         (select job_count from scope),
         sum(p.weighted_demand)::integer
  from public.role_family_profile p
  join public.skills sk on sk.id = p.skill_id
  where p.family = any(coalesce(p_families, array[]::text[]))
    and (p_seniority is null or p.seniority = p_seniority)
    and nullif(btrim(sk.taxonomy_key), '') is not null
  group by sk.taxonomy_key;
$$;

revoke all on function public.role_family_demand(text[], text) from public;
grant execute on function public.role_family_demand(text[], text) to anon, authenticated, service_role;

select public.refresh_role_family_labels();

notify pgrst, 'reload schema';
