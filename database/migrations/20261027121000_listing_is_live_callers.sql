-- Listing Liveness (CONTEXT.md → Listing Liveness): every SQL reader of the
-- live rule calls public.listing_is_live(<row>) instead of spelling the two
-- columns. Bodies are otherwise byte-identical to the live definitions on
-- 2026-10-27 (pg_get_functiondef), with the predicate replaced.
--
-- One change in behaviour, on purpose: refresh_sector_panel spelled only
-- `listing_confidence = 'active'` and dropped `is_active`. Zero rows differed
-- on 2026-10-27 (no listing was active-confidence and inactive).
--
-- Planning: the function inlines to `is_active IS TRUE AND listing_confidence
-- = 'active'`. Partial indexes spelled with a bare `is_active` cannot be proven
-- from that, so their IS TRUE twins shipped first (20261027120500).
--
-- Revert: re-apply each function's previous migration and the policy below
-- with the spelled-out predicate.

CREATE OR REPLACE FUNCTION public.count_jobs_awaiting_judgment()
 RETURNS TABLE(total integer, recommendable integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT COUNT(*)::INTEGER,
           COUNT(*) FILTER (
               WHERE public.listing_is_live(job)
           )::INTEGER
    FROM (
        SELECT DISTINCT skill.job_id
        FROM public.job_skills AS skill
        WHERE skill.evidence_source = 'stage_a'
    ) AS floored
    JOIN public.jobs AS job ON job.job_id = floored.job_id
    WHERE job.skill_judged_at IS NULL AND job.has_skill_floor IS TRUE;
$function$
;

CREATE OR REPLACE FUNCTION public.count_jobs_missing_skill_floor()
 RETURNS TABLE(total integer, recommendable integer, awaiting_stage_a integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT COUNT(*)::INTEGER AS total,
           COUNT(*) FILTER (
               WHERE public.listing_is_live(job)
           )::INTEGER AS recommendable,
           COUNT(*) FILTER (
               WHERE job.skill_floor_attempted_at IS NULL
                 AND job.job_description IS NOT NULL
           )::INTEGER AS awaiting_stage_a
    FROM public.jobs AS job
    WHERE job.has_skill_floor IS FALSE;
$function$
;

CREATE OR REPLACE FUNCTION public.count_new_jobs_for_user(p_user_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := auth.uid();
  v_marker timestamptz;
  v_count  bigint;
begin
  if v_caller is not null and v_caller <> p_user_id then
    raise exception 'count_new_jobs_for_user: not your user'
      using errcode = '42501';
  end if;

  select coalesce(
           p.last_match_run_at,
           (select max(m.computed_at)
              from public.user_job_matches m
             where m.user_id = p_user_id)
         )
    into v_marker
    from public.user_profiles p
   where p.id = p_user_id;

  if v_marker is null then
    return 0;
  end if;

  select count(*)
    into v_count
    from public.jobs j
   where public.listing_is_live(j)
     and j.ingested_at > v_marker;

  return coalesce(v_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_role_family_locations(p_family text, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 8)
 RETURNS TABLE(location text, open_count integer, is_remote boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH live_jobs AS (
        SELECT location_city, location_mode
        FROM public.jobs
        WHERE role_family = p_family
          AND public.listing_is_live(jobs)
    ), choices AS (
        SELECT location_city AS location, COUNT(*)::INTEGER AS open_count, FALSE AS is_remote
        FROM live_jobs
        WHERE NULLIF(BTRIM(location_city), '') IS NOT NULL
          AND LOWER(BTRIM(location_city)) <> 'remote'
        GROUP BY location_city
        UNION ALL
        SELECT 'Remote'::TEXT AS location, COUNT(*)::INTEGER AS open_count, TRUE AS is_remote
        FROM live_jobs
        WHERE location_mode = 'remote'
        HAVING COUNT(*) > 0
    )
    SELECT location, open_count, is_remote
    FROM choices
    WHERE NULLIF(BTRIM(p_query), '') IS NULL
       OR location ILIKE '%' || BTRIM(p_query) || '%'
    ORDER BY open_count DESC, location ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 50));
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_company_directory()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now  timestamptz := now();
  v_rows integer;
begin
  with fresh as (
    select btrim(j.company_name)        as name,
           lower(btrim(j.company_name)) as sort_key,
           count(*)::integer            as active_count
    from public.jobs as j
    where public.listing_is_live(j)
      and j.company_name is not null
      and btrim(j.company_name) <> ''
    group by btrim(j.company_name)
  ), upserted as (
    insert into public.company_directory (name, sort_key, active_count, refreshed_at)
    select name, sort_key, active_count, v_now from fresh
    on conflict (name) do update
      set sort_key = excluded.sort_key,
          active_count = excluded.active_count,
          refreshed_at = excluded.refreshed_at
    returning name
  )
  select count(*)::integer into v_rows from upserted;

  delete from public.company_directory where refreshed_at <> v_now;

  return jsonb_build_object('companies', v_rows, 'refreshed_at', v_now);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.roles_met_by_skill_level(p_skill_id integer, p_from_level integer, p_to_level integer, p_cities text[] DEFAULT NULL::text[])
 RETURNS TABLE(newly_met integer, met_total integer, total_asking integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    with scoped as (
        select coalesce(js.required_level, case when js.is_primary then 4 else 2 end) as bar
        from public.job_skills js
        join public.jobs j on j.job_id = js.job_id
        where js.skill_id = p_skill_id
          and public.listing_is_live(j)
          and (
            p_cities is null
            or cardinality(p_cities) = 0
            or j.location_city = any(p_cities)
          )
    )
    select
        count(*) filter (where bar <= p_to_level and bar > coalesce(p_from_level, 0))::integer,
        count(*) filter (where bar <= p_to_level)::integer,
        count(*)::integer
    from scoped;
$function$
;

CREATE OR REPLACE FUNCTION public.top_companies_at(p_kind text, p_value text, p_limit integer DEFAULT 8, p_sort text DEFAULT 'roles'::text)
 RETURNS TABLE(company_name text, open_count integer, location_country text, max_seen integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    with scoped as (
        select btrim(j.company_name) as company_name,
               nullif(btrim(j.location_country), '') as location_country,
               nullif(greatest(coalesce(j.last_seen, 0), coalesce(j.first_seen, 0)), 0) as seen
        from public.jobs j
        where public.listing_is_live(j)
          and nullif(btrim(j.company_name), '') is not null
          and ((p_kind = 'industry' and j.industry_group = p_value)
            or (p_kind = 'city'     and j.location_city  = p_value))
    ), grouped as (
        select s.company_name,
               count(*)::integer as open_count,
               max(s.seen)::integer as max_seen,
               mode() within group (order by s.location_country) as location_country
        from scoped s
        group by s.company_name
    )
    select g.company_name, g.open_count, g.location_country, g.max_seen
    from grouped g
    order by (case when p_sort = 'last_seen' then g.max_seen end) desc nulls last,
             g.open_count desc,
             g.company_name
    limit greatest(1, least(20, coalesce(p_limit, 8)));
$function$
;

CREATE OR REPLACE FUNCTION public.candidate_jobs_for_user(p_skill_keys text[], p_countries text[] DEFAULT NULL::text[], p_require_fresh boolean DEFAULT true, p_after_job_id text DEFAULT NULL::text, p_limit integer DEFAULT 1000)
 RETURNS TABLE(job_id text, job_title text, role_domain text, career_band text, seniority_level text, min_years_experience integer, max_years_experience integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select j.job_id,
         j.job_title,
         j.role_domain,
         j.career_band,
         j.seniority_level,
         j.min_years_experience,
         j.max_years_experience
    from (
      select distinct js.job_id
        from public.job_skills js
       where js.skill_id in (
               select s.id from public.skills s where s.taxonomy_key = any(p_skill_keys)
             )
         and (p_after_job_id is null or js.job_id > p_after_job_id)
       order by js.job_id
    ) ids
    cross join lateral (
      select *
        from public.jobs j
       where j.job_id = ids.job_id
         and (
           not p_require_fresh
           or (public.listing_is_live(j))
         )
         and (
           p_countries is null
           or cardinality(p_countries) = 0
           or lower(btrim(j.location_country)) = any(p_countries)
           or (
             (j.location_country is null or btrim(j.location_country) = '')
             and lower(btrim(j.location_mode)) in ('remote', 'hybrid')
           )
         )
    ) j
   order by ids.job_id
   limit greatest(1, least(coalesce(p_limit, 1000), 1000));
$function$
;

CREATE OR REPLACE FUNCTION public.company_open_roles_page(p_company text, p_limit integer, p_offset integer)
 RETURNS TABLE(job_id text, job_title text, location text, location_raw text, location_city text, location_country text, location_mode text, location_quality text, total_count bigint, primary_skills text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    with page as (
        select j.job_id, j.job_title, j.location, j.location_raw,
               j.location_city, j.location_country, j.location_mode,
               j.location_quality
        from public.jobs j
        where lower(j.company_name) = lower(btrim(p_company))
          and public.listing_is_live(j)
        order by j.job_id
        limit least(greatest(coalesce(p_limit, 50), 1), 101)
        offset least(greatest(coalesce(p_offset, 0), 0), 10000)
    ), total as (
        select coalesce(sum(d.active_count), 0)::bigint as n
        from public.company_directory d
        where d.sort_key = lower(btrim(p_company))
    )
    select p.job_id, p.job_title, p.location, p.location_raw,
           p.location_city, p.location_country, p.location_mode,
           p.location_quality, t.n,
           coalesce(skills.names, '{}'::text[])
    from page p
    cross join total t
    left join lateral (
        select array_agg(ranked.display_name order by ranked.rn) as names
        from (
            select s.display_name,
                   row_number() over (
                       order by js.required_level desc nulls last, s.display_name
                   ) as rn
            from public.job_skills js
            join public.skills s on s.id = js.skill_id
            where js.job_id = p.job_id
              and js.is_primary
              and btrim(coalesce(s.display_name, '')) <> ''
        ) ranked
        where ranked.rn <= 5
    ) skills on true
    order by p.job_id;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_company_pulse()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now          timestamptz := now();
  v_today        date := (timezone('utc', v_now))::date;
  v_week         integer := to_char(v_today - 7, 'YYYYMMDD')::integer;
  v_series_start integer := to_char(v_today - 29, 'YYYYMMDD')::integer;
  v_rows         integer;
begin
  -- Open = live, the predicate refresh_company_directory counts.
  -- Weekly = first_seen >= today-7. Series buckets = first_seen in [today-29, today].
  with src as (
    select
      lower(regexp_replace(btrim(j.company_name), '\s+', ' ', 'g')) as sort_key,
      regexp_replace(btrim(j.company_name), '\s+', ' ', 'g') as company_name,
      (public.listing_is_live(j)) as is_live,
      j.first_seen
    from public.jobs as j
    where j.company_name is not null
      and btrim(j.company_name) <> ''
  ),
  agg as (
    select
      sort_key,
      min(company_name) as company_name,
      count(*) filter (where is_live)::integer as open_roles,
      count(*) filter (
        where first_seen is not null and first_seen >= v_week
      )::integer as weekly_delta
    from src
    group by sort_key
  ),
  buckets as (
    select
      sort_key,
      29 - (v_today - to_date(first_seen::text, 'YYYYMMDD')) as bucket,
      count(*)::integer as n
    from src
    where first_seen is not null
      and first_seen >= v_series_start
      and first_seen <= to_char(v_today, 'YYYYMMDD')::integer
      and first_seen::text ~ '^[0-9]{8}$'
    group by sort_key, 29 - (v_today - to_date(first_seen::text, 'YYYYMMDD'))
  ),
  fresh as (
    select
      a.sort_key,
      a.company_name,
      a.open_roles,
      a.weekly_delta,
      (
        select coalesce(
          array_agg(coalesce(b.n, 0) order by gs.i),
          array_fill(0, array[30])::integer[]
        )
        from generate_series(0, 29) as gs(i)
        left join buckets b
          on b.sort_key = a.sort_key and b.bucket = gs.i
      ) as inflow_by_day
    from agg a
  ),
  upserted as (
    insert into public.company_pulse_snapshot (
      sort_key, company_name, open_roles, weekly_delta,
      inflow_by_day, refreshed_at
    )
    select
      sort_key, company_name, open_roles, weekly_delta,
      inflow_by_day, v_now
    from fresh
    where cardinality(inflow_by_day) = 30
    on conflict (sort_key) do update
      set company_name  = excluded.company_name,
          open_roles    = excluded.open_roles,
          weekly_delta  = excluded.weekly_delta,
          inflow_by_day = excluded.inflow_by_day,
          refreshed_at  = excluded.refreshed_at
    returning sort_key
  )
  select count(*)::integer into v_rows from upserted;

  delete from public.company_pulse_snapshot where refreshed_at <> v_now;

  return jsonb_build_object('companies', v_rows, 'refreshed_at', v_now);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_public_provenance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- The window the hero number claims: a listing we opened inside a week.
  v_window_days   constant integer := 7;
  v_total         integer;
  v_community     integer;
  v_verified_live integer;
begin
  -- Three counts, not one scan: each of these has its own index, and a single
  -- pass over the whole heap would read more of it than the three together.
  select count(*)::integer into v_total from public.jobs;

  -- `jobs.ingestion_source` value the extension import writes
  -- (services/job_importer.build_imported_job). NULL and everything else is
  -- the agent's crawl, so agent = total - community.
  select count(*)::integer into v_community
    from public.jobs
   where ingestion_source = 'extension';

  -- Both halves. `last_conclusive_verification_at` says a verifier opened it,
  -- not that it was open: on 2026-09-23, 8,295 of 27,681 listings checked
  -- inside a week had been found dead. Never `last_verified_live_at`, which the
  -- crawler stamps for any job_id it sees in an employer's feed.
  select count(*)::integer into v_verified_live
    from public.jobs
   where last_conclusive_verification_at >= now() - make_interval(days => v_window_days)
     and public.listing_is_live(jobs);

  insert into public.public_provenance_snapshot (
    id, total, community, verified_live, verified_window_days, refreshed_at
  )
  values (1, v_total, v_community, v_verified_live, v_window_days, now())
  on conflict (id) do update
    set total                = excluded.total,
        community            = excluded.community,
        verified_live        = excluded.verified_live,
        verified_window_days = excluded.verified_window_days,
        refreshed_at         = excluded.refreshed_at;

  return jsonb_build_object(
    'total', v_total,
    'community', v_community,
    'verified_live', v_verified_live,
    'verified_window_days', v_window_days
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_skill_closeness()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rows integer;
begin
  delete from public.skill_closeness;

  with live as (
    select job_id, company_name from public.jobs
    where public.listing_is_live(jobs)
  ), j as (
    select js.job_id, js.skill_id, l.company_name
    from public.job_skills js join live l on l.job_id = js.job_id
  ), df as (
    select skill_id, count(*) df from j group by skill_id having count(*) >= 20
  ), jf as (
    select j.job_id, j.skill_id, j.company_name from j join df on df.skill_id = j.skill_id
  ), pc as (
    select a.skill_id a, b.skill_id b, a.company_name co, count(*) c
    from jf a join jf b on a.job_id = b.job_id and a.skill_id < b.skill_id
    group by 1, 2, 3
  ), e as (
    select a, b, sum(c) c, count(*) companies
    from pc group by a, b
    having sum(c) >= 10 and count(*) >= 3 and max(c)::numeric / sum(c) <= 0.5
  ), s as (
    select e.a, e.b, e.c, e.companies,
           e.c * (select count(*) from live)::numeric / (da.df * db.df) lift
    from e join df da on da.skill_id = e.a join df db on db.skill_id = e.b
  ), both_dir as (
    select a src, b dst, lift, c, companies from s where lift >= 3
    union all
    select b src, a dst, lift, c, companies from s where lift >= 3
  ), ranked as (
    select src, dst, lift, c, companies,
           row_number() over (partition by src order by lift desc, dst) rn
    from both_dir
  ), ins as (
    insert into public.skill_closeness (skill_id, close_skill_id, lift, jobs, companies)
    select src, dst, lift::real, c, companies from ranked where rn <= 20
    returning 1
  )
  select count(*)::integer into v_rows from ins;

  return jsonb_build_object('rows', v_rows, 'refreshed_at', now());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.candidates_for_user(p_user_id uuid, p_limit integer DEFAULT 40)
 RETURNS TABLE(job_id text, score numeric, overlap integer, on_direction boolean, level_stated boolean, checked_recently boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
        where public.listing_is_live(j) and j.apply_url is not null
          and j.career_band = any(v_bands)
      union all
        select j.job_id, j.role_family, j.location_country, j.company_name,
               j.job_title, j.min_years_experience, j.max_years_experience,
               j.seniority_level,
               j.last_conclusive_verification_at, j.ingested_at
        from public.jobs j
        where public.listing_is_live(j) and j.apply_url is not null
          and j.career_band is null and j.role_family = any(v_families)
    ),
    cand as (
        select * from pool p
        where p.job_title !~* '(intern|trainee|graduate|campus|fresher|apprentice)'
          -- The employer's minimum must be within reach. There is no floor: a
          -- role asking fewer years than the person has is theirs to take, and
          -- the brain grades over-qualification (Shivam, 2026-09-28).
          and coalesce(p.lo, 0)::numeric <= v_hi
          and not (p.lo is null and p.hi is null
                   and lower(coalesce(p.tag, '')) = any(v_senior_tags)
                   and v_centre < 5)
          and not (p.jid = any(v_decided))
    ),
    overlap as (
        select js.job_id as jid, count(*)::int as n_hits,
               sum(case when js.is_primary then 2 else 1 end)::numeric as weighted
        from public.job_skills js
        where js.skill_id = any(v_skills)
        group by js.job_id
    ),
    scored as (
        select c.jid, c.company_name, c.job_title,
               (coalesce(o.weighted, 0)
                + case when c.checked_at > now() - interval '7 days' then 1 else 0 end
                + case when c.ingested_at > now() - interval '14 days' then 1 else 0 end)::numeric as sc,
               coalesce(o.n_hits, 0)::int as n_hits,
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
$function$
;

-- Behaviour change: this copy spelled only `listing_confidence = 'active'`.
CREATE OR REPLACE FUNCTION public.refresh_sector_panel()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_method       text := 'sector-panel-v1';
  v_min_roles    integer := 100;
  v_min_employers integer := 5;
  v_rows         integer;
  v_sectors_tracked integer;
  v_live_tracked    integer;
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
  where public.listing_is_live(j)
    and nullif(btrim(j.industry_group), '') is not null;

  create index on _sp_live (sector);

  select count(distinct sector), count(*) into v_sectors_tracked, v_live_tracked from _sp_live;

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
    sectors_tracked, live_roles_tracked, method_version, computed_at
  )
  select
    b.sector,
    b.live_roles,
    b.employers,
    b.new_roles_30d,
    b.role_families,
    round(b.new_roles_30d::numeric / nullif(b.live_roles, 0), 3),
    coalesce((
      select jsonb_agg(jsonb_build_object('name', r.role_family, 'roles', r.n) order by r.n desc)
      from (
        select role_family, count(*) n
        from _sp_live l
        where l.sector = b.sector and nullif(btrim(l.role_family), '') is not null
        group by role_family order by n desc limit 8
      ) r
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('name', s.display_name, 'roles', s.n) order by s.n desc)
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
      select jsonb_agg(jsonb_build_object('band', m.career_band, 'roles', m.n) order by m.n desc)
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
    v_sectors_tracked,
    v_live_tracked,
    v_method,
    now()
  from _sp_base b;

  get diagnostics v_rows = row_count;
  return jsonb_build_object('rows', v_rows, 'method', v_method,
                            'sectors_tracked', v_sectors_tracked);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_role_family_labels()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where role_family is not null and public.listing_is_live(jobs)
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
    where role_family is not null and public.listing_is_live(jobs)
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

  delete from public.career_band_scope;

  with banded as (
    select role_family as family, career_band, count(*)::integer as n
    from public.jobs
    where public.listing_is_live(jobs)
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

  delete from public.role_family_profile;
  delete from public.role_family_scope;

  insert into public.role_family_scope (family, seniority, job_count)
  select j.role_family,
         coalesce(nullif(public.canonical_source_seniority(j.seniority_level), ''), 'unknown'),
         count(*)::integer
  from public.jobs j
  where j.role_family is not null and public.listing_is_live(j)
    and exists (select 1 from public.role_family_labels l where l.family = j.role_family)
  group by 1, 2;

  with live as (
    select j.job_id, j.role_family family,
           coalesce(nullif(public.canonical_source_seniority(j.seniority_level), ''), 'unknown') seniority
    from public.jobs j
    where j.role_family is not null and public.listing_is_live(j)
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
$function$
;

-- The jobs read policy: the same public branch, now the function. The planner
-- inlines it to the expression it replaces, so authenticated reads keep their
-- plans (trap 5 in READ_PATH_PLAYBOOK.md is unchanged, not worsened).
ALTER POLICY "jobs public read" ON public.jobs
  USING (public.listing_is_live(jobs) OR created_by_user_id = auth.uid());
