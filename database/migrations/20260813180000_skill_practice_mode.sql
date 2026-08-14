-- Tax-L1/L2/L3 describes where a skill lives. It does not answer whether Myro
-- can teach and assess that L3 skill on a five-level ladder. The old
-- `skill_kind` approximation answered from L1 alone, so the mixed
-- Communication clusters left behavioral skills (Communication,
-- Collaboration) competing with Python and SQL in the demand rail.
--
-- `practice_mode` is deliberately L3-scoped:
--   levelled  -> objective L1-L5 ladder, demand rail, gaps and matching
--   scenario  -> behavioral evidence; retained for later case-study practice
--   observed  -> real job signal, but no current Myro practice contract
--
-- The override is curation data. The generated public value makes the default
-- deterministic: the uniformly behavioral Physical/Inherent domain is
-- scenario; every other real skill is levelled unless explicitly reviewed.

begin;

alter table public.skills
  add column if not exists practice_mode_override text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'skills_practice_mode_override_check'
      and conrelid = 'public.skills'::regclass
  ) then
    alter table public.skills
      add constraint skills_practice_mode_override_check
      check (practice_mode_override is null or practice_mode_override in ('levelled', 'scenario', 'observed'));
  end if;
end
$$;

alter table public.skills
  add column if not exists practice_mode text
  generated always as (
    coalesce(
      practice_mode_override,
      case
        when l1_domain = 'Physical and Inherent Abilities' then 'scenario'
        else 'levelled'
      end
    )
  ) stored;

create index if not exists idx_skills_practice_mode
  on public.skills (practice_mode);

comment on column public.skills.practice_mode_override is
  'Reviewed L3 practice classification. NULL uses the taxonomy-derived default; '
  'set only when a mixed taxonomy area needs a skill-specific correction.';

comment on column public.skills.practice_mode is
  'How Myro may practise this canonical L3 skill: levelled (L1-L5), scenario '
  '(behavioral/case-study), or observed (tracked but not currently practised).';

-- Conservative reviewed corrections for behavioral skills living outside the
-- uniformly-soft L1. The list is asserted so a renamed/non-resolving key cannot
-- silently reintroduce the exact failure this migration closes.
do $$
declare
  expected constant text[] := array[
    'Active Listening',
    'Body Language',
    'Building Consensus',
    'Collaboration',
    'Communication',
    'Cross-Functional Collaboration',
    'Interpersonal Communications',
    'Listening Skills',
    'Non-Verbal Communication',
    'Reflective Listening',
    'Relationship Building',
    'Verbal Communication Skills',
    'Workplace Communication'
  ];
  missing text;
begin
  foreach missing in array expected loop
    if not exists (
      select 1 from public.skills where taxonomy_key = missing
    ) then
      raise exception 'practice-mode correction names missing taxonomy skill "%"', missing;
    end if;
  end loop;

  update public.skills
  set practice_mode_override = 'scenario'
  where taxonomy_key = any(expected)
    and practice_mode_override is distinct from 'scenario';
end
$$;

-- Behavioral demand stays measurable, but it is stored independently from the
-- levelled rail. Keeping the existing skill_demand_snapshot levelled-only is
-- deploy-safe: old readers cannot accidentally interleave two rank sequences.
create table if not exists public.skill_scenario_demand_snapshot (
  location_city text not null,
  window_key text not null check (window_key in ('30d', 'all')),
  skill_id integer not null references public.skills(id) on delete cascade,
  display_name text not null,
  roles integer not null,
  companies integer not null,
  top_company_share numeric(4, 3) not null default 0,
  rank integer not null,
  computed_at timestamptz not null default now(),
  primary key (location_city, window_key, skill_id)
);

create index if not exists idx_skill_scenario_demand_snapshot_read
  on public.skill_scenario_demand_snapshot (location_city, window_key, rank);
create index if not exists idx_skill_scenario_demand_snapshot_skill
  on public.skill_scenario_demand_snapshot (skill_id);

comment on table public.skill_scenario_demand_snapshot is
  'Behavioral/scenario skill demand retained for research and future case-study '
  'practice. It never feeds the current levelled demand rail or L1-L5 ladders.';

alter table public.skill_scenario_demand_snapshot enable row level security;
revoke all on table public.skill_scenario_demand_snapshot from public, anon, authenticated;
grant select, insert, update, delete on table public.skill_scenario_demand_snapshot to service_role;

-- liveness, geography, spread, dominance and non-skill guards remain. The only
-- semantic change is ranking levelled and scenario skills independently and
-- writing them to separate snapshots.
create or replace function public.refresh_skill_demand_snapshot(
  p_min_city_roles integer default 150,
  p_min_companies integer default 3,
  p_limit_per_cell integer default 12,
  p_max_company_share numeric default 0.7
)
returns table(cities integer, rows_written integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cities integer := 0;
  v_levelled_rows integer := 0;
  v_scenario_rows integer := 0;
  v_floor_30d integer := to_char(
    (now() at time zone 'utc') - interval '30 days',
    'YYYYMMDD'
  )::integer;
begin
  drop table if exists _sd_live;
  create temp table _sd_live on commit drop as
  select j.job_id, j.company_name, j.location_city, j.first_seen
  from public.jobs j
  where j.location_city is not null
    and btrim(j.location_city) <> ''
    and coalesce(j.listing_confidence, 'uncertain') not in ('closed', 'likely_closed')
    and not exists (
      select 1
      from public.skill_demand_city_deny d
      where d.location_city = j.location_city
    );

  create index on _sd_live (job_id);
  create index on _sd_live (location_city);

  delete from public.skill_demand_city;
  insert into public.skill_demand_city (location_city, live_roles, computed_at)
  select location_city, count(*), now()
  from _sd_live
  group by 1
  having count(*) >= p_min_city_roles;
  get diagnostics v_cities = row_count;

  drop table if exists _sd_ranked;
  create temp table _sd_ranked on commit drop as
  with eligible as (
    select l.job_id, l.company_name, l.location_city, l.first_seen
    from _sd_live l
    join public.skill_demand_city c on c.location_city = l.location_city
  ),
  paired as (
    select e.location_city, e.company_name, e.job_id, e.first_seen,
           sk.id as skill_id, sk.display_name, sk.practice_mode
    from eligible e
    join public.job_skills js on js.job_id = e.job_id
    join public.skills sk on sk.id = js.skill_id
    join public.skill_demand_domain_allow a on a.l1_domain = sk.l1_domain
    where sk.display_name is not null
      and btrim(sk.display_name) <> ''
      and sk.practice_mode in ('levelled', 'scenario')
      and not exists (
        select 1
        from public.skill_demand_skill_deny sd
        where sd.skill_id = sk.id
      )
  ),
  windowed as (
    select location_city, 'all'::text as window_key, skill_id, display_name,
           practice_mode, company_name, job_id
    from paired
    union all
    select location_city, '30d'::text, skill_id, display_name,
           practice_mode, company_name, job_id
    from paired
    where first_seen >= v_floor_30d
  ),
  per_company as (
    select location_city, window_key, skill_id, display_name, practice_mode,
           company_name, count(distinct job_id) as company_roles
    from windowed
    group by 1, 2, 3, 4, 5, 6
  ),
  counted as (
    select location_city, window_key, skill_id, display_name, practice_mode,
           sum(company_roles)::integer as roles,
           count(*)::integer as companies,
           max(company_roles)::numeric / nullif(sum(company_roles), 0) as top_company_share
    from per_company
    group by 1, 2, 3, 4, 5
  )
  select *, row_number() over (
    partition by location_city, window_key, practice_mode
    order by roles desc, companies desc, display_name asc
  )::integer as rank
  from counted
  where companies >= p_min_companies
    and coalesce(top_company_share, 1) <= p_max_company_share;

  delete from public.skill_demand_snapshot;
  insert into public.skill_demand_snapshot
    (location_city, window_key, skill_id, display_name, roles, companies,
     top_company_share, rank, computed_at)
  select location_city, window_key, skill_id, display_name, roles, companies,
         round(coalesce(top_company_share, 0), 3), rank, now()
  from _sd_ranked
  where practice_mode = 'levelled'
    and rank <= p_limit_per_cell;
  get diagnostics v_levelled_rows = row_count;

  delete from public.skill_scenario_demand_snapshot;
  insert into public.skill_scenario_demand_snapshot
    (location_city, window_key, skill_id, display_name, roles, companies,
     top_company_share, rank, computed_at)
  select location_city, window_key, skill_id, display_name, roles, companies,
         round(coalesce(top_company_share, 0), 3), rank, now()
  from _sd_ranked
  where practice_mode = 'scenario'
    and rank <= p_limit_per_cell;
  get diagnostics v_scenario_rows = row_count;

  return query select v_cities, v_levelled_rows + v_scenario_rows;
end;
$function$;

revoke all on function public.refresh_skill_demand_snapshot(integer, integer, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.refresh_skill_demand_snapshot(integer, integer, integer, numeric)
  to service_role;

-- V2 carries the fields matching actually ranks on. The old RPC returned only
-- is_primary + taxonomy_key, so its adapter silently lost required_level and
-- the soft/levelled boundary on every job-id-scoped match read.
create or replace function public.fetch_job_skills_by_job_ids_v2(job_ids text[])
returns table (
  job_id text,
  is_primary boolean,
  required_level integer,
  taxonomy_key text,
  practice_mode text
)
language sql
stable
security invoker
set search_path = public
as $function$
  select js.job_id,
         js.is_primary,
         js.required_level::integer,
         s.taxonomy_key::text,
         s.practice_mode
  from public.job_skills js
  join public.skills s on s.id = js.skill_id
  where js.job_id = any(job_ids);
$function$;

revoke all on function public.fetch_job_skills_by_job_ids_v2(text[])
  from public, anon;
grant execute on function public.fetch_job_skills_by_job_ids_v2(text[])
  to authenticated, service_role;

-- Harden the compatibility function while deployed callers cut over.
revoke all on function public.fetch_job_skills_by_job_ids(text[])
  from public, anon;
grant execute on function public.fetch_job_skills_by_job_ids(text[])
  to authenticated, service_role;

select * from public.refresh_skill_demand_snapshot();

notify pgrst, 'reload schema';

commit;
