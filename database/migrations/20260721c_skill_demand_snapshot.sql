-- Skill demand by location + window — precomputed snapshot.
--
-- WHY A SNAPSHOT, NOT A LIVE QUERY
-- The honest demand number is a 3-way join (jobs × job_skills × skills) with
-- two DISTINCT aggregates. Measured on prod 2026-07-21: Gurugram/30d = 150ms,
-- Bengaluru/all-time = 2.07s (seq scan over 298k job_skills rows). A 2s
-- aggregate on a rail is the same saturation shape backlog #41 removed from
-- login. So it is computed on ingest/verify and read as one indexed lookup.
--
-- WHAT THIS FIXES (measured, Gurugram, 2026-07-21)
-- The old rail read jobs.main_skills with NO liveness filter, NO company floor
-- and NO taxonomy filter. "Agentic AI ↑321" was 259 rows of which 8 were live,
-- 250 of them one company (Genpact) whose 250 postings had 2 live. The
-- genuinely strongest live demand — M&A Laws and Regulations, 92 roles across
-- 3 companies, all live — never surfaced. The rail ranked by deadness.
--
-- Three guards, all applied here:
--   liveness  — closed / likely_closed excluded
--   spread    — a skill needs >= p_min_companies distinct employers, so one
--               bulk poster's JD template cannot own a city
--   dominance — no single employer may exceed p_max_company_share of a skill's
--               roles. The company floor alone is too weak at Bengaluru scale:
--               "Requisition" showed 678 roles across 4 employers, but 672 of
--               them (99%) were one company's template. Measured shares —
--               Requisition 99%, Functional Excellence 97% (both artefacts);
--               Root Cause Analysis 62%, CI/CD 17% (both real).
--   taxonomy  — skills.l1_domain must be in skill_demand_domain_allow, which
--               drops the non-occupational bucket ("Ingenuity", "Visionary",
--               "Curiosity" all sit in 'Physical and Inherent Abilities')
--
-- Curation is DATA (two small tables), not constants in a function body, so a
-- taxonomy or city correction is a row edit, not a deploy.

begin;

-- ── curation ────────────────────────────────────────────────────────────────

create table if not exists skill_demand_domain_allow (
  l1_domain text primary key,
  note      text
);

comment on table skill_demand_domain_allow is
  'Occupational skill domains eligible for the demand panel. Seeded with every '
  'domain in `skills` EXCEPT non-occupational ones. Deliberately inclusive: '
  'cutting to white-collar domains would silently hide demand from health care, '
  'manufacturing and education job seekers.';

insert into skill_demand_domain_allow (l1_domain, note)
select distinct l1_domain, null
from skills
where l1_domain is not null
  and btrim(l1_domain) <> ''
  -- personal attributes, not upskillable skills: Ingenuity, Visionary, Curiosity
  and l1_domain <> 'Physical and Inherent Abilities'
  -- single-row artefact of taxonomy import, not a real domain
  and l1_domain <> 'Data'
on conflict (l1_domain) do nothing;

create table if not exists skill_demand_city_deny (
  location_city text primary key,
  reason        text
);

comment on table skill_demand_city_deny is
  'Values in jobs.location_city that are not cities. location_quality cannot '
  'gate these — it reads ''ok'' for India, In and Karnataka alike.';

insert into skill_demand_city_deny (location_city, reason) values
  ('India',      'country'),
  ('In',         'truncated token'),
  ('Karnataka',  'state'),
  ('Maharashtra','state'),
  ('Telangana',  'state'),
  ('Haryana',    'state'),
  ('Tamil Nadu', 'state'),
  ('Remote',     'work mode, not a place')
on conflict (location_city) do nothing;

-- ── snapshot ────────────────────────────────────────────────────────────────

create table if not exists skill_demand_snapshot (
  location_city text    not null,
  window_key    text    not null check (window_key in ('30d', 'all')),
  skill_id      integer not null references skills(id) on delete cascade,
  display_name  text    not null,
  roles         integer not null,
  companies     integer not null,
  -- share of `roles` held by the single largest employer. Kept so the guard is
  -- auditable after the fact — a number nobody can re-derive is a number nobody
  -- can trust.
  top_company_share numeric(4, 3) not null default 0,
  rank          integer not null,
  computed_at   timestamptz not null default now(),
  primary key (location_city, window_key, skill_id)
);

create index if not exists idx_skill_demand_snapshot_read
  on skill_demand_snapshot (location_city, window_key, rank);

comment on column skill_demand_snapshot.companies is
  'Distinct employers hiring for this skill. Shipped to the client alongside '
  'roles — it is the honesty signal that makes a single-employer spike legible.';

create table if not exists skill_demand_city (
  location_city text primary key,
  live_roles    integer not null,
  computed_at   timestamptz not null default now()
);

comment on table skill_demand_city is
  'Cities the picker may offer: enough live listings to say anything true.';

-- Public market aggregate: no user data, no PII. Readable by anyone; writes
-- happen through the refresh function under the service role.
alter table skill_demand_snapshot      enable row level security;
alter table skill_demand_city          enable row level security;
alter table skill_demand_domain_allow  enable row level security;
alter table skill_demand_city_deny     enable row level security;

drop policy if exists skill_demand_snapshot_read on skill_demand_snapshot;
create policy skill_demand_snapshot_read on skill_demand_snapshot
  for select to anon, authenticated using (true);

drop policy if exists skill_demand_city_read on skill_demand_city;
create policy skill_demand_city_read on skill_demand_city
  for select to anon, authenticated using (true);

drop policy if exists skill_demand_domain_allow_read on skill_demand_domain_allow;
create policy skill_demand_domain_allow_read on skill_demand_domain_allow
  for select to anon, authenticated using (true);

drop policy if exists skill_demand_city_deny_read on skill_demand_city_deny;
create policy skill_demand_city_deny_read on skill_demand_city_deny
  for select to anon, authenticated using (true);

-- ── refresh ─────────────────────────────────────────────────────────────────

create or replace function refresh_skill_demand_snapshot(
  p_min_city_roles      integer default 150,
  p_min_companies       integer default 3,
  p_limit_per_cell      integer default 12,
  p_max_company_share   numeric default 0.7
)
returns table (cities integer, rows_written integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cities integer := 0;
  v_rows   integer := 0;
  -- first_seen / last_seen are YYYYMMDD integers, not epoch offsets. Convert
  -- the window bound the same way rather than doing integer arithmetic on a
  -- date-shaped number (20260701 - 30 is not 30 days earlier).
  v_floor_30d integer := to_char((now() at time zone 'utc') - interval '30 days', 'YYYYMMDD')::integer;
begin
  -- ON COMMIT DROP clears this at transaction end; the explicit drop covers a
  -- second call inside the SAME transaction, where the name would still exist.
  drop table if exists _sd_live;
  create temp table _sd_live on commit drop as
  select j.job_id, j.company_name, j.location_city, j.first_seen
  from jobs j
  where j.location_city is not null
    and btrim(j.location_city) <> ''
    and coalesce(j.listing_confidence, 'uncertain') not in ('closed', 'likely_closed')
    and not exists (
      select 1 from skill_demand_city_deny d where d.location_city = j.location_city
    );

  create index on _sd_live (job_id);
  create index on _sd_live (location_city);

  delete from skill_demand_city;
  insert into skill_demand_city (location_city, live_roles, computed_at)
  select location_city, count(*), now()
  from _sd_live
  group by 1
  having count(*) >= p_min_city_roles;
  get diagnostics v_cities = row_count;

  delete from skill_demand_snapshot;

  with eligible as (
    select l.job_id, l.company_name, l.location_city, l.first_seen
    from _sd_live l
    join skill_demand_city c on c.location_city = l.location_city
  ),
  paired as (
    select e.location_city, e.company_name, e.job_id, e.first_seen,
           sk.id as skill_id, sk.display_name
    from eligible e
    join job_skills js on js.job_id = e.job_id
    join skills sk on sk.id = js.skill_id
    join skill_demand_domain_allow a on a.l1_domain = sk.l1_domain
    where sk.display_name is not null and btrim(sk.display_name) <> ''
  ),
  windowed as (
    select location_city, 'all'::text as window_key, skill_id, display_name, company_name, job_id
    from paired
    union all
    select location_city, '30d'::text, skill_id, display_name, company_name, job_id
    from paired
    where first_seen >= v_floor_30d
  ),
  per_company as (
    select location_city, window_key, skill_id, display_name, company_name,
           count(distinct job_id) as company_roles
    from windowed
    group by 1, 2, 3, 4, 5
  ),
  counted as (
    select location_city, window_key, skill_id, display_name,
           sum(company_roles)::integer as roles,
           count(*)::integer           as companies,
           max(company_roles)::numeric / nullif(sum(company_roles), 0) as top_company_share
    from per_company
    group by 1, 2, 3, 4
  ),
  ranked as (
    select *, row_number() over (
      partition by location_city, window_key
      order by roles desc, companies desc, display_name asc
    ) as rank
    from counted
    where companies >= p_min_companies
      and coalesce(top_company_share, 1) <= p_max_company_share
  )
  insert into skill_demand_snapshot
    (location_city, window_key, skill_id, display_name, roles, companies,
     top_company_share, rank, computed_at)
  select location_city, window_key, skill_id, display_name, roles, companies,
         round(coalesce(top_company_share, 0), 3), rank, now()
  from ranked
  where rank <= p_limit_per_cell;
  get diagnostics v_rows = row_count;

  return query select v_cities, v_rows;
end;
$$;

comment on function refresh_skill_demand_snapshot is
  'Recomputes the skill-demand panel. Called after a scrape batch finalises and '
  'after a verifier sweep — the verifier flipping listings to closed changes '
  'these counts as much as new ingest does.';

revoke all on function refresh_skill_demand_snapshot(integer, integer, integer) from public;

commit;
