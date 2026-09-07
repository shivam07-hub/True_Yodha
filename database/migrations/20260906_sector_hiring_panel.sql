-- Wave 2, first slice: the sector hiring panel.
--
-- What is actually hiring in an Indian sector right now — live roles, employers,
-- momentum, the roles and skills being asked for, and the seniority mix. Built
-- for recruiters, EdTech and HR tech, and readable by a jobseeker, which is why
-- it ships as a public page rather than an authed one.
--
-- It carries one number nobody else can publish: the share of that sector's
-- closed roles still sitting in the employer's own feed, cross-referenced from
-- the Ghost Job Index. The panel says what is open; the index says whether to
-- believe it.
--
-- Same discipline as the index, for the same reason — this names sectors in
-- public:
--
--   * Tier 0. Precomputed here, read as one row. Nothing aggregates on request.
--   * A minimum cell. Media & Telecom has 6 live roles across 2 employers;
--     publishing that as a "sector" would be noise wearing a heading. A sector
--     appears only with >= 100 live roles AND >= 5 employers.
--   * Denominators travel with rates, and the coverage block states what is
--     withheld rather than leaving a reader to assume the list is the market.
--   * `industry_group` unset is excluded, never bucketed into "Other" — an
--     unclassified listing is missing data, not a sector.

create table if not exists public.sector_panel_snapshot (
  sector            text primary key,

  live_roles        integer not null,
  employers         integer not null,
  new_roles_30d     integer not null,
  role_families     integer not null,

  -- Momentum as a share of the live pool, so a big sector and a small one are
  -- comparable. Published with both counts beside it.
  new_share         numeric(4, 3),

  -- Top role families and skills, each with the count behind them: a list of
  -- names alone is a claim a reader cannot weigh.
  top_roles         jsonb not null default '[]'::jsonb,
  top_skills        jsonb not null default '[]'::jsonb,
  seniority_mix     jsonb not null default '[]'::jsonb,

  -- From the Ghost Job Index, same corpus, different question. NULL when that
  -- index withheld the sector for its own minimum cell — a withheld number is
  -- never silently replaced with a computed-here substitute.
  still_advertised_rate numeric(4, 3),

  method_version    text not null,
  computed_at       timestamptz not null default now()
);

comment on table public.sector_panel_snapshot is
  'Sector hiring panel. Public aggregate over public job listings: no user '
  'data, no PII. A sector appears only above the minimum cell, and every rate '
  'ships with its counts.';

comment on column public.sector_panel_snapshot.still_advertised_rate is
  'Cross-referenced from ghost_index_snapshot. NULL means the index withheld '
  'it, not that the sector is clean.';

create index if not exists sector_panel_snapshot_read
  on public.sector_panel_snapshot (live_roles desc);

alter table public.sector_panel_snapshot enable row level security;

drop policy if exists sector_panel_snapshot_read on public.sector_panel_snapshot;
create policy sector_panel_snapshot_read on public.sector_panel_snapshot
  for select to anon, authenticated using (true);

grant select on public.sector_panel_snapshot to anon, authenticated;
grant select, insert, update, delete on public.sector_panel_snapshot to service_role;


create or replace function public.refresh_sector_panel()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method       text := 'sector-panel-v1';
  v_min_roles    integer := 100;
  v_min_employers integer := 5;
  v_rows         integer;
begin
  create temp table _sp_live on commit drop as
  select
    nullif(btrim(j.industry_group), '') as sector,
    j.job_id,
    j.company_name,
    j.role_family,
    j.career_band,
    (j.ingested_at > now() - interval '30 days') as is_new
  from jobs j
  where j.listing_confidence = 'active'
    and nullif(btrim(j.industry_group), '') is not null;

  create index on _sp_live (sector);

  create temp table _sp_base on commit drop as
  select
    sector,
    count(*)::int                                   as live_roles,
    count(distinct company_name)::int               as employers,
    count(*) filter (where is_new)::int             as new_roles_30d,
    count(distinct role_family)::int                as role_families
  from _sp_live
  group by sector
  having count(*) >= v_min_roles
     and count(distinct company_name) >= v_min_employers;

  delete from sector_panel_snapshot;

  insert into sector_panel_snapshot (
    sector, live_roles, employers, new_roles_30d, role_families, new_share,
    top_roles, top_skills, seniority_mix, still_advertised_rate,
    method_version, computed_at
  )
  select
    b.sector,
    b.live_roles,
    b.employers,
    b.new_roles_30d,
    b.role_families,
    round(b.new_roles_30d::numeric / nullif(b.live_roles, 0), 3),
    coalesce((
      select jsonb_agg(jsonb_build_object('name', r.role_family, 'roles', r.n)
                       order by r.n desc)
      from (
        select role_family, count(*) n
        from _sp_live l
        where l.sector = b.sector and nullif(btrim(l.role_family), '') is not null
        group by role_family order by n desc limit 8
      ) r
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('name', s.display_name, 'roles', s.n)
                       order by s.n desc)
      from (
        select sk.display_name, count(distinct js.job_id) n
        from _sp_live l
        join job_skills js on js.job_id = l.job_id
        join skills sk on sk.id = js.skill_id
        where l.sector = b.sector
        group by sk.display_name order by n desc limit 10
      ) s
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('band', m.career_band, 'roles', m.n)
                       order by m.n desc)
      from (
        select career_band, count(*) n
        from _sp_live l
        where l.sector = b.sector and nullif(btrim(l.career_band), '') is not null
        group by career_band
      ) m
    ), '[]'::jsonb),
    (select g.still_advertised_rate
       from ghost_index_snapshot g
      where g.scope = 'sector' and g.period = 'all' and g.scope_key = b.sector),
    v_method,
    now()
  from _sp_base b;

  get diagnostics v_rows = row_count;
  return jsonb_build_object('rows', v_rows, 'method', v_method);
end;
$$;

comment on function public.refresh_sector_panel() is
  'Recomputes sector_panel_snapshot. Full replace: the panel is small, and a '
  'partial rebuild that half-updates a published figure is worse than a slow one.';

revoke all on function public.refresh_sector_panel() from public, anon, authenticated;
grant execute on function public.refresh_sector_panel() to service_role;
