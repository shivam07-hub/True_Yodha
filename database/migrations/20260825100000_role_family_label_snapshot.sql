-- list_role_families: 2,125ms -> Tier 0. It was never mainly an RLS problem.
--
-- MEASURED on prod 2026-08-25, `list_role_families(null,'financial analyst',10,null)`:
--
--   authenticated                                  2,417 ms
--   service_role                                   2,125 ms   <- only 292ms is RLS
--   the live_jobs scan alone                          10 ms
--   the label pipeline (regex+hashagg+sort+window)   507 ms
--   the skill-match join alone                         3.8 ms
--
-- ARCHITECTURE_READ_PATH.md S15 row 4 called this "trap 5 plus a slow
-- baseline". Decomposed, it is ~88% baseline: 419ms of that 507ms is four
-- nested REGEXP_REPLACE evaluated per row over 32,374 live titles, and the
-- `live_jobs` CTE is referenced three times (family_counts, family_matches,
-- cleaned_titles), so the pipeline runs about three times per call. 3 x ~500ms
-- is the 2,125ms. Marking it `security definer` alone would have bought 292ms
-- of 2,417ms and left the ledger row open — measure before theorising.
--
-- The label taxonomy and the per-family open counts depend on `jobs` alone:
-- not on the caller, not on the typed query, not on the skill set. They belong
-- in a snapshot refreshed on ingest (playbook fix order #1), which is what
-- `/public/stats` does to reach 1.2ms. Only the skill-overlap count is
-- per-caller, and that measures 3.8ms.
--
-- Reuses the existing Tier-0 durability machinery rather than inventing a
-- second one: `snapshot_refresh_state` + claim/finish leases (section 9).
-- Registering a task is one row.

create table if not exists public.role_family_labels (
  family       text primary key,
  label        text        not null,
  open_count   integer     not null default 0,
  refreshed_at timestamptz not null default now()
);

comment on table public.role_family_labels is
  'Tier-0 snapshot: the most common cleaned job title per role family, and the '
  'family''s live open count. Public aggregate over trusted-active jobs, no '
  'per-user data. Refreshed by refresh_role_family_labels() through the '
  'snapshot_refresh_state lease. See migration 20260825100000.';

alter table public.role_family_labels enable row level security;

drop policy if exists "role family labels are public" on public.role_family_labels;
create policy "role family labels are public"
  on public.role_family_labels for select using (true);

-- The expensive half, run once per ingest instead of once per keystroke.
create or replace function public.refresh_role_family_labels()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now  timestamptz := now();
  v_rows integer;
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
    insert into public.role_family_labels (family, label, open_count, refreshed_at)
    select family, label, open_count, v_now from fresh
    on conflict (family) do update
      set label = excluded.label,
          open_count = excluded.open_count,
          refreshed_at = excluded.refreshed_at
    returning family
  )
  select count(*)::integer into v_rows from upserted;

  -- A family whose last live job closed must stop being offered as a target.
  -- Stamped equality, not a time window: every row this run touched carries
  -- v_now exactly, so anything else is a family that no longer has live jobs.
  delete from public.role_family_labels where refreshed_at <> v_now;

  return jsonb_build_object('families', v_rows, 'refreshed_at', v_now);
end;
$$;

revoke all on function public.refresh_role_family_labels() from public;
grant execute on function public.refresh_role_family_labels() to service_role;

-- SEED BEFORE SWAP. dev and prod share one database, so between replacing the
-- function and the first scheduled refresh the typeahead would return nothing
-- to live users. Populate first; the reader only ever sees a full snapshot.
select public.refresh_role_family_labels();

-- The read is now a 300-row scan plus the per-caller skill join.
--
-- SECURITY DEFINER on the same argument as 20260825090000: the only base-table
-- predicate is `is_active AND listing_confidence = 'active'`, which IS the jobs
-- RLS public branch, so the result set is identical and only the plan changes.
-- No caller guard: the parameters are a skill-id list, a typed string and a
-- page size, and every row returned is a public aggregate over public jobs.
create or replace function public.list_role_families(
  p_skill_ids integer[] default array[]::integer[],
  p_query     text      default null,
  p_limit     integer   default 3,
  p_families  text[]    default null
)
returns table (family text, label text, open_count integer, matched_skill_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  with matches as (
    select j.role_family as family,
           count(distinct js.skill_id)::integer as matched_skill_count
    from public.jobs j
    join public.job_skills js on js.job_id = j.job_id
    where j.role_family is not null
      and j.is_active is true
      and j.listing_confidence = 'active'
      and js.skill_id = any(coalesce(p_skill_ids, array[]::integer[]))
    group by j.role_family
  )
  select snap.family, snap.label, snap.open_count,
         coalesce(m.matched_skill_count, 0) as matched_skill_count
  from public.role_family_labels snap
  left join matches m on m.family = snap.family
  where case
    when p_families is not null then snap.family = any(p_families)
    when nullif(btrim(p_query), '') is not null then snap.label ilike '%' || btrim(p_query) || '%'
    else coalesce(m.matched_skill_count, 0) >= 1
  end
  order by coalesce(m.matched_skill_count, 0) desc, snap.open_count desc, snap.label asc
  limit greatest(1, least(coalesce(p_limit, 3), 50));
$$;

revoke all on function public.list_role_families(integer[], text, integer, text[]) from public;
grant execute on function public.list_role_families(integer[], text, integer, text[])
  to anon, authenticated, service_role;

-- Register the task with the existing lease machinery. `task` carries a CHECK
-- constraint listing the known tasks, so the row cannot be inserted until the
-- constraint knows about it — a payload field with no migration 500s at runtime.
alter table public.snapshot_refresh_state
  drop constraint if exists snapshot_refresh_state_task_check;
alter table public.snapshot_refresh_state
  add constraint snapshot_refresh_state_task_check
  check (task = any (array['analytics', 'skill_demand', 'job_search', 'role_families']));

insert into public.snapshot_refresh_state (task, status, requested_by)
values ('role_families', 'pending', 'migration_20260825100000')
on conflict (task) do nothing;
