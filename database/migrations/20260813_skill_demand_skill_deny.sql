-- Skill-level denylist for the demand panel.
--
-- WHY THE EXISTING GUARDS ARE NOT ENOUGH
-- 20260721c added four guards: liveness, spread (>= p_min_companies employers),
-- dominance (no employer over p_max_company_share), and taxonomy (l1_domain
-- allow-list). They catch a skill that is one company's template. They cannot
-- catch a string that is not a skill at all but is spread across several
-- employers, because it looks exactly like healthy demand.
--
-- Measured on the 2026-08-12 refresh, Gurugram:
--   "Requisition"  rank 6 (30d) / rank 4 (all) — 65 roles, 3 companies, top
--                  share 0.54. Passes spread AND dominance.
-- That string is an ATS field label ("Requisition ID: 12345") that the JD
-- extractor lifted as a skill. The 20260721c comment already caught it at
-- Bengaluru scale (678 roles, 99% one company) where dominance removed it; at
-- Gurugram scale it is split across three employers and sails through.
--
-- The city deny-list cannot express this (it is not a city) and the domain
-- allow-list cannot either (its l1_domain is 'Business', which is otherwise
-- legitimate). Hence a third curation table, same principle as the other two:
-- curation is DATA, so a correction is a row edit and not a deploy.
--
-- SEEDED CONSERVATIVELY. Only strings that are not skills in any reading: ATS
-- field labels and JD section headers. Generic-but-real skills ("Communication",
-- 15 cities / 4,157 roles; "Collaboration", 9 cities) are deliberately NOT
-- denied here — whether a soft skill belongs on a demand rail is a product
-- judgement for a human, not a data-quality fix.

begin;

create table if not exists skill_demand_skill_deny (
  skill_id integer primary key references skills (id) on delete cascade,
  reason   text not null,
  added_at timestamptz not null default now()
);

comment on table skill_demand_skill_deny is
  'Taxonomy entries that are not occupational skills — ATS field labels and JD '
  'section headers the extractor lifted verbatim. They survive the spread and '
  'dominance guards whenever several employers use the same boilerplate, so '
  'they need naming individually. Not a place to express taste about which real '
  'skills matter; use it only when the string is not a skill.';

insert into skill_demand_skill_deny (skill_id, reason)
select s.id, v.reason
from (values
  ('Requisition',          'ATS field label ("Requisition ID"), not a skill'),
  ('Business Requirements','JD section header lifted verbatim by the extractor'),
  ('Business Objectives',  'JD section header lifted verbatim by the extractor')
) as v(taxonomy_key, reason)
join skills s on s.taxonomy_key = v.taxonomy_key
on conflict (skill_id) do nothing;

-- ── refresh: apply the new denylist ─────────────────────────────────────────
-- Body is unchanged from 20260721c except for the `skill_demand_skill_deny`
-- anti-join in `paired`.

create or replace function public.refresh_skill_demand_snapshot(
  p_min_city_roles    integer default 150,
  p_min_companies     integer default 3,
  p_limit_per_cell    integer default 12,
  p_max_company_share numeric default 0.7
)
returns table(cities integer, rows_written integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cities integer := 0;
  v_rows   integer := 0;
  v_floor_30d integer := to_char((now() at time zone 'utc') - interval '30 days', 'YYYYMMDD')::integer;
begin
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
      and not exists (
        select 1 from skill_demand_skill_deny sd where sd.skill_id = sk.id
      )
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
$function$;

revoke all on function refresh_skill_demand_snapshot(integer, integer, integer, numeric) from public;

-- Curation data, service-role only. RLS on with NO read policy, deliberately
-- unlike its siblings in 20260721c: `skill_demand_city_deny` and
-- `skill_demand_domain_allow` carry `for select to anon, authenticated` because
-- the picker reads them. Nothing outside `refresh_skill_demand_snapshot` (which
-- is security definer) ever reads this table, so a public read policy would
-- widen the surface for a consumer that does not exist. Do not "fix" the
-- inconsistency by adding one — check for a reader first.
alter table skill_demand_skill_deny enable row level security;

commit;
