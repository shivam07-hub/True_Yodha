-- Direction stops ranking by family SIZE, and starts naming what the cluster hires for.
--
-- `list_role_families` ordered by `count(distinct js.skill_id)` — how many of the
-- caller's skills appear in ANY job in the family. That is not a fit measure, it
-- is a size measure. MEASURED on prod 2026-09-08, 378 users with skills against
-- 334 live families:
--
--   corr(family open_count, distinct skills the family contains)   0.827
--   AI/ML in the top six for                                       90% of users
--   Business Operations in the top six for                         88% of users
--   Business Operations ranked #1 for                              41.3% of users
--   AI/ML ranked #1 for                                            30.7% of users
--
-- Seven users in ten got one of two families first. A big family holds nearly
-- every skill somewhere (Business Operations: 2,322 distinct skills over 2,326
-- jobs), so the count saturates and the tie-break `open_count desc` decides.
--
-- It is not only a bad suggestion. `target-confirm.tsx` AUTO-SELECTS rank #1 at
-- >= 3 matched skills, which fired for 150 of the 156 Business-Operations users
-- and 109 of 116 AI/ML — and Business Operations renders as its modal job title,
-- "Branch Manager-BRANCH BANKING-Branch Head", because Kotak is 18% of the
-- corpus. The whole downstream loop (role_family_market_skills -> compute_gap_skills
-- -> the prep ladder) is scoped by this one choice.
--
-- THE SCORE. Weight each of the family's skills by how CHARACTERISTIC it is:
--
--   prevalence(s,f) = weighted demand for s in f / live jobs in f   (primary x2, side x1,
--                                                                    the weighting
--                                                                    role_family_market_skills
--                                                                    already uses)
--   idf(s)          = ln(total families / families containing s)
--   weight(s,f)     = prevalence x idf
--   fit(f)          = sum of weight over the caller's skills / ||weight(.,f)||
--   score(f)        = fit x ln(1 + open_count)
--
-- Prevalence removes the sponge effect: a skill in 1 of 2,303 AI/ML jobs is worth
-- ~0. IDF removes the generic skills (Communication, MS Office) that made 2-job
-- families look like a perfect match. The norm makes wide and narrow families
-- comparable. ln(open_count) keeps inventory in the ranking — a direction with no
-- jobs behind it is not a direction.
--
-- MEASURED against 186 real picks (`user_profiles.target_roles`). Two scopes,
-- because the incumbent contaminates the first: a pick its own top-3 produced is
-- self-fulfilling. The honest population is the 124 picks it MISSED — the people
-- who had to find the search box.
--
--                                    recall@6 all (169)   recall@6 searched (124)
--   current (distinct-skill count)         35.5%                12.1%
--   coverage of family demand              14.2%                   --
--   cosine, no volume term                 23.1%                24.2%
--   cosine x sqrt(open)                    34.9%                15.3%
--   cosine x ln(1+open)   <- this          34.3%                22.6%
--
-- Parity overall, +87% for the people the old ranking sent looking. Rank-#1
-- concentration 41.3% -> 17.5%. Recall@20 55% -> 65%. Proficiency weighting was
-- tried (matched_level on the user vector) and made it worse — 22.5%/21.0% — so
-- the user vector stays binary.
--
-- SNAPSHOT, not per-call. The weights depend on `jobs` alone — not the caller,
-- not the typed query. Building them scans 555,009 job_skills rows and measures
-- 3.1s; that belongs on ingest, beside the labels it already refreshes (fix order
-- #1, same Tier-0 lease). The per-caller read stays a small index join on the
-- caller's skill ids. 66,094 rows.

create table if not exists public.role_family_skill_weights (
  family   text    not null references public.role_family_labels(family) on delete cascade,
  skill_id integer not null,
  weight   real    not null,
  primary key (family, skill_id)
);

create index if not exists idx_role_family_skill_weights_skill
  on public.role_family_skill_weights (skill_id) include (family, weight);

comment on table public.role_family_skill_weights is
  'Tier-0 snapshot: prevalence x IDF weight of each skill within each role family, '
  'over trusted-active jobs. Public aggregate, no per-user data. Rows with a zero '
  'weight are not stored — a skill every family demands distinguishes nothing. '
  'Refreshed by refresh_role_family_labels(). See migration 20260909100000.';

alter table public.role_family_skill_weights enable row level security;

drop policy if exists "role family skill weights are public" on public.role_family_skill_weights;
create policy "role family skill weights are public"
  on public.role_family_skill_weights for select using (true);

-- ||weight(.,f)||, stored beside the family so the read never recomputes it.
alter table public.role_family_labels
  add column if not exists weight_norm real not null default 0;

-- The family's most-demanded skills, as display names — the payload Direction
-- shows so the person can see what the cluster actually hires for.
alter table public.role_family_labels
  add column if not exists top_skills text[] not null default array[]::text[];

-- A residual bucket of the Lightcast taxonomy: what a job falls into when its
-- skills are generic. These stay offerable and searchable — they hold 19% of live
-- jobs, including real, abundant, reachable work — but Myro must never propose one
-- unprompted, because it cannot defend "Business Operations" as someone's direction.
--
-- SEEDED, NOT DERIVED, and deliberately so. The obvious derived rule — a family
-- whose single most-demanded skill covers a low share of its jobs — was measured
-- and does not separate: Cybersecurity 20.4% and Data Analysis 23.1% both sit
-- BELOW Business Solutions 27.8%. This is an editorial set. It is a column rather
-- than a predicate in code so it can be changed without a deploy, and the refresh
-- below never overwrites it after insert.
alter table public.role_family_labels
  add column if not exists is_catch_all boolean not null default false;

comment on column public.role_family_labels.is_catch_all is
  'Residual taxonomy bucket. Offerable and searchable, never auto-proposed. '
  'Editorial and hand-maintainable: refresh_role_family_labels() sets it only on '
  'INSERT, so an update here survives every refresh.';

-- The expensive half, still once per ingest. Labels first (the weights table has
-- an FK onto them), then the weights, then the two derived columns that read them.
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
begin
  with live_jobs as (
    select job_id, role_family, job_title
    from public.jobs
    where role_family is not null
      and is_active is true
      and listing_confidence = 'active'
  ), family_counts as (
    select role_family as family, count(*)::integer as open_count
    from live_jobs
    group by role_family
  ), cleaned_titles as (
    select role_family as family,
           btrim(regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(job_title, '^[[:space:]]*(RB-LS:|Branch:)[[:space:]]*', '', 'i'),
                 '[[:space:]]+L[1-5][[:space:]]*$', '', 'i'
               ),
               '([[:space:]]*-[[:space:]]*Sales){2,}[[:space:]]*$', '', 'i'
             ),
             '[[:space:]]+', ' ', 'g'
           )) as cleaned_title
    from live_jobs
    where nullif(btrim(job_title), '') is not null
  ), title_counts as (
    select family, cleaned_title, count(*) as title_count
    from cleaned_titles
    where cleaned_title <> ''
    group by family, cleaned_title
  ), labels as (
    select family, cleaned_title as label,
           row_number() over (
             partition by family
             order by title_count desc, cleaned_title asc
           ) as label_rank
    from title_counts
  ), fresh as (
    select c.family, l.label, c.open_count
    from family_counts c
    join labels l on l.family = c.family and l.label_rank = 1
  ), upserted as (
    insert into public.role_family_labels (family, label, open_count, refreshed_at, is_catch_all)
    select f.family, f.label, f.open_count, v_now,
           -- Seed rule, INSERT only. See the column comment: editorial, flippable.
           (f.family like 'General %'
            or f.family like 'Other %'
            or f.family in (
              'Business Operations', 'Business Management', 'Business Solutions',
              'Business Leadership', 'Business Continuity', 'Computer Science',
              'Administrative Support and Clerical Tasks',
              'Office and Productivity Equipment and Technology',
              'Scripting Languages', 'Query Languages'
            ))
    from fresh f
    on conflict (family) do update
      set label = excluded.label,
          open_count = excluded.open_count,
          refreshed_at = excluded.refreshed_at
      -- is_catch_all deliberately absent: a hand edit must survive the refresh.
    returning family
  )
  select count(*)::integer into v_rows from upserted;

  -- A family whose last live job closed must stop being offered as a target.
  -- Stamped equality, not a time window: every row this run touched carries
  -- v_now exactly, so anything else is a family that no longer has live jobs.
  -- Its weights go with it through the FK.
  delete from public.role_family_labels where refreshed_at <> v_now;

  -- Rebuilt whole rather than diffed: IDF moves with the corpus, so every
  -- surviving row's weight changes on every ingest anyway.
  delete from public.role_family_skill_weights;

  with live_jobs as (
    select job_id, role_family
    from public.jobs
    where role_family is not null
      and is_active is true
      and listing_confidence = 'active'
  ), fam_skill as (
    select lj.role_family as family,
           js.skill_id,
           sum(case when js.is_primary then 2 else 1 end)::numeric as demand
    from live_jobs lj
    join public.job_skills js on js.job_id = lj.job_id
    group by lj.role_family, js.skill_id
  ), family_total as (
    select role_family as family, count(*)::numeric as jobs
    from live_jobs group by role_family
  ), corpus as (
    select count(distinct family)::numeric as families from fam_skill
  ), idf as (
    select fs.skill_id,
           ln((select families from corpus) / count(*)::numeric) as idf
    from fam_skill fs group by fs.skill_id
  ), inserted as (
    insert into public.role_family_skill_weights (family, skill_id, weight)
    select fs.family, fs.skill_id, ((fs.demand / ft.jobs) * i.idf)::real
    from fam_skill fs
    join family_total ft on ft.family = fs.family
    join idf i on i.skill_id = fs.skill_id
    -- A skill every family demands separates nothing, and ln(N/N) = 0.
    where i.idf > 0
    returning 1
  )
  select count(*)::integer into v_weights from inserted;

  -- ||weight(.,f)||, and the characteristic skills the person is shown.
  -- Ordered by weight, not raw frequency: frequency would answer every family
  -- with "Communication, Teamwork".
  update public.role_family_labels snap
  set weight_norm = coalesce(agg.norm, 0),
      top_skills  = coalesce(agg.names, array[]::text[])
  from (
    select w.family,
           sqrt(sum(w.weight::numeric * w.weight::numeric))::real as norm,
           (array_agg(sk.display_name order by w.weight desc, sk.display_name asc))[1:8] as names
    from public.role_family_skill_weights w
    join public.skills sk on sk.id = w.skill_id
    where nullif(btrim(sk.display_name), '') is not null
    group by w.family
  ) agg
  where agg.family = snap.family;

  update public.role_family_labels
  set weight_norm = 0, top_skills = array[]::text[]
  where family not in (select family from public.role_family_skill_weights);

  return jsonb_build_object(
    'families', v_rows, 'skill_weights', v_weights, 'refreshed_at', v_now
  );
end;
$$;

revoke all on function public.refresh_role_family_labels() from public;
grant execute on function public.refresh_role_family_labels() to service_role;

-- SEED BEFORE SWAP, same rule as 20260825100000: dev and prod share one database,
-- so the reader must never observe a half-built snapshot.
select public.refresh_role_family_labels();

-- The seed above is INSERT-only so a hand edit survives every refresh. Every
-- family already existed when this shipped, so all 330 rows took the do-update
-- path and none was seeded. One-time backfill, same rule.
update public.role_family_labels
set is_catch_all = true
where family like 'General %'
   or family like 'Other %'
   or family in (
     'Business Operations', 'Business Management', 'Business Solutions',
     'Business Leadership', 'Business Continuity', 'Computer Science',
     'Administrative Support and Clerical Tasks',
     'Office and Productivity Equipment and Technology',
     'Scripting Languages', 'Query Languages'
   );

-- The reader. Return type gains three columns, so it is dropped and recreated —
-- CREATE OR REPLACE cannot change OUT parameters.
drop function if exists public.list_role_families(integer[], text, integer, text[]);

-- `matched_skills` is the caller's OWN highest-weighted skills in the family, not
-- the intersection with `top_skills`. Intersecting the two showed an empty list
-- beside a family ranked third — the ranking reads every weight the caller
-- matches, the display was reading only the family's top eight. A number that
-- cannot explain the order it sits in is the defect this migration exists to fix.
--
-- So the option carries two lists: what the cluster hires for, and what the
-- person already has. The gap between them is the answer Direction is asked for,
-- and it needs no arithmetic to read.
--
-- SECURITY DEFINER on the same argument as 20260825100000: every row returned is
-- a public aggregate over public jobs, and the only base-table predicate is the
-- jobs RLS public branch, so the result set is identical and only the plan changes.
create or replace function public.list_role_families(
  p_skill_ids integer[] default array[]::integer[],
  p_query     text      default null,
  p_limit     integer   default 6,
  p_families  text[]    default null
)
returns table (
  family              text,
  label               text,
  open_count          integer,
  matched_skill_count integer,
  top_skills          text[],
  matched_skills      text[],
  is_catch_all        boolean
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
         snap.is_catch_all
  from public.role_family_labels snap
  left join fit f on f.family = snap.family
  where case
    when p_families is not null then snap.family = any(p_families)
    when nullif(btrim(p_query), '') is not null then snap.label ilike '%' || btrim(p_query) || '%'
                                                  or snap.family ilike '%' || btrim(p_query) || '%'
    else coalesce(f.matched_skill_count, 0) >= 1 and snap.weight_norm > 0
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

revoke all on function public.list_role_families(integer[], text, integer, text[]) from public;
grant execute on function public.list_role_families(integer[], text, integer, text[])
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
