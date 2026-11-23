-- A snapshot refresh fits its budget, and one that does not stops hammering.
--
-- Measured on prod (Micro), 2026-11-23:
--   * role_families timed out on 140 of 168 hourly runs in seven days: 281
--     minutes of database work, each run rolled back. Its five steps each
--     re-read the 53k live jobs from the 771 MB jobs table (25-33s a pass), and
--     five passes outgrew pg_cron's 2-minute statement timeout from 2026-11-17.
--     Role-family labels, weights, bands, scope and profile have been stale since.
--   * ghost_index timed out on every daily run since 2026-11-08. It read jobs
--     three times (17.6s a pass) and job_listing_observations three times
--     (20.5s a pass, via listing_close_events, listing_feed_presence and a union).
--   * A timeout raises query_canceled, which `when others` does not match. The
--     failure was never written, the task stayed 'pending', and the hourly
--     retry spent the same two minutes again every hour. Those two-minute runs
--     sat on the one shared database every user read waits on.
--
-- Changes, each the smallest that removes its cause:
--   1. refresh_role_family_labels reads the live jobs once into a temp table.
--   2. refresh_ghost_index reads jobs once and the observations once.
--   3. run_snapshot_sql_refresh records a timeout as a failed run.
--   4. A task that keeps failing backs off (1h, 2h, 4h ... a day) instead of
--      running every hour: consecutive_failures, kept by finish and read by claim.
--
-- Additive: one new column with a default; functions are replaced in place and
-- keep their grants. Results are unchanged.

alter table public.snapshot_refresh_state
  add column if not exists consecutive_failures integer not null default 0;

-- ── 1. Role families: one read of the live jobs ─────────────────────────────

create or replace function public.refresh_role_family_labels()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_now      timestamptz := now();
  v_rows     integer;
  v_weights  integer;
  v_profile  integer;
  v_bands    integer;
begin
  -- Every step below reads this one set; each used to re-read public.jobs.
  drop table if exists pg_temp._rf_live;
  create temp table _rf_live on commit drop as
  select j.job_id,
         j.role_family as family,
         j.job_title,
         coalesce(nullif(public.canonical_source_seniority(j.seniority_level), ''), 'unknown') as seniority,
         j.career_band
  from public.jobs j
  where j.role_family is not null and public.listing_is_live(j);
  analyze pg_temp._rf_live;

  with family_counts as (
    select family, count(*)::integer as open_count from pg_temp._rf_live group by family
  ), cleaned_titles as (
    select family,
           btrim(regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(job_title, '^[[:space:]]*(RB-LS:|Branch:)[[:space:]]*', '', 'i'),
                 '[[:space:]]+L[1-5][[:space:]]*$', '', 'i'),
               '([[:space:]]*-[[:space:]]*Sales){2,}[[:space:]]*$', '', 'i'),
             '[[:space:]]+', ' ', 'g')) as cleaned_title
    from pg_temp._rf_live where nullif(btrim(job_title), '') is not null
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

  with fam_skill as (
    select lj.family, js.skill_id,
           sum(case when js.is_primary then 2 else 1 end)::numeric as demand
    from pg_temp._rf_live lj join public.job_skills js on js.job_id = lj.job_id
    group by lj.family, js.skill_id
  ), family_total as (
    select family, count(*)::numeric as jobs from pg_temp._rf_live group by family
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
    select family, career_band, count(*)::integer as n
    from pg_temp._rf_live
    where career_band is not null
    group by family, career_band
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
  select l.family, l.seniority, count(*)::integer
  from pg_temp._rf_live l
  where exists (select 1 from public.role_family_labels f where f.family = l.family)
  group by 1, 2;

  with live as (
    select l.job_id, l.family, l.seniority
    from pg_temp._rf_live l
    where exists (select 1 from public.role_family_labels f where f.family = l.family)
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
$function$;

-- ── 2. Ghost index: one read of jobs, one of the observations ───────────────

create or replace function public.refresh_ghost_index()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_method   text := 'ghost-index-v2';
  v_min_cell integer := 20;
  v_rows     integer;
  v_companies integer;
begin
  -- Every per-job fact the index needs from the observations, in one pass. The
  -- rules are the ones listing_close_events and listing_feed_presence publish;
  -- admissibility keeps its one home in close_evidence_is_admissible.
  drop table if exists _gi_obs;
  create temp table _gi_obs on commit drop as
  select job_id,
         max(observed_at) filter (where observer = 'verifier' and result = 'seen_live') as verifier_seen_live,
         min(observed_at) filter (where result = 'closed' and close_evidence_is_admissible(evidence)) as closed_at,
         max(observed_at) filter (where observer = 'scraper' and result = 'seen_live') as last_in_feed,
         min(observed_at) filter (where observer = 'scraper' and result = 'source_missing') as dropped_from_feed
  from job_listing_observations
  group by job_id;

  drop table if exists _gi_base;
  create temp table _gi_base on commit drop as
  select
    j.job_id,
    nullif(btrim(j.company_name), '')    as company_name,
    nullif(btrim(j.industry_group), '')  as industry_group,
    o.closed_at,
    o.last_in_feed,
    o.dropped_from_feed,
    (o.closed_at is not null)                                as is_closed,
    (o.closed_at is null and v.last_seen_live is not null)   as is_live,
    (o.closed_at is not null or v.last_seen_live is not null) as is_conclusive,
    (o.closed_at is not null and o.last_in_feed is not null)  as in_scope,
    (o.closed_at is not null and o.last_in_feed is not null
       and o.dropped_from_feed is null
       and o.last_in_feed >= o.closed_at)                     as still_advertised,
    (o.closed_at is not null and o.last_in_feed is not null
       and o.dropped_from_feed is not null
       and o.dropped_from_feed > o.closed_at)                 as ad_pulled,
    case
      when o.closed_at is not null and o.last_in_feed is not null
       and o.dropped_from_feed is null and o.last_in_feed >= o.closed_at
      then extract(epoch from (o.last_in_feed - o.closed_at)) / 86400.0
    end                                                       as days_still_advertised,
    case
      when o.closed_at is not null and o.last_in_feed is not null
       and o.dropped_from_feed is not null
       and o.dropped_from_feed > o.closed_at
      then extract(epoch from (o.dropped_from_feed - o.closed_at)) / 86400.0
    end                                                       as days_to_pull,
    case
      when o.closed_at is not null and j.ingested_at is not null
       and o.closed_at > j.ingested_at
      then extract(epoch from (o.closed_at - j.ingested_at)) / 86400.0
    end                                                       as observed_days
  from jobs j
  left join _gi_obs o on o.job_id = j.job_id
  -- A verifier confirmation counts wherever it is recorded: an observation row
  -- or the jobs column. greatest() skips a null side.
  cross join lateral (
    select greatest(o.verifier_seen_live, j.last_verified_live_at) as last_seen_live
  ) v;

  select count(distinct company_name) into v_companies from _gi_base;

  drop table if exists _gi_rows;
  create temp table _gi_rows on commit drop as
  with expanded as (
    select 'overall'::text as scope, 'all'::text as scope_key, b.* from _gi_base b
    union all
    select 'company', b.company_name, b.* from _gi_base b where b.company_name is not null
    union all
    select 'sector', b.industry_group, b.* from _gi_base b where b.industry_group is not null
  ),
  periodised as (
    select e.*, 'all'::text as period from expanded e
    union all
    select e.*, to_char(e.closed_at, 'YYYY-MM') from expanded e where e.closed_at is not null
  )
  select
    scope, scope_key, period,
    count(*) filter (where is_conclusive)::int      as listings_conclusive,
    count(*) filter (where is_closed)::int          as listings_closed,
    count(*) filter (where is_live)::int            as listings_live,
    count(*) filter (where not is_conclusive)::int  as listings_inconclusive,
    count(*) filter (where in_scope)::int           as feed_overlap,
    count(*) filter (where still_advertised)::int   as still_advertised,
    count(*) filter (where ad_pulled)::int          as ad_pulled_after_close,
    round(avg(days_still_advertised)::numeric, 1)   as avg_days_still_advertised,
    round(percentile_cont(0.5) within group (order by days_to_pull)::numeric, 1)
                                                    as median_days_to_pull,
    round(percentile_cont(0.5) within group (order by observed_days)::numeric, 1)
                                                    as median_observed_days
  from periodised
  group by scope, scope_key, period;

  delete from ghost_index_snapshot;

  insert into ghost_index_snapshot (
    scope, scope_key, period,
    listings_conclusive, listings_closed, listings_live, listings_inconclusive,
    feed_overlap, still_advertised, still_advertised_rate,
    avg_days_still_advertised, ad_pulled_after_close, median_days_to_pull,
    median_observed_days, companies_in_corpus, method_version, computed_at
  )
  select
    scope, scope_key, period,
    case when period = 'all' then listings_conclusive end,
    listings_closed,
    case when period = 'all' then listings_live end,
    case when period = 'all' then listings_inconclusive end,
    feed_overlap, still_advertised,
    case when feed_overlap >= v_min_cell
         then round(still_advertised::numeric / feed_overlap, 3) end,
    case when feed_overlap >= v_min_cell then avg_days_still_advertised end,
    ad_pulled_after_close,
    case when ad_pulled_after_close >= v_min_cell then median_days_to_pull end,
    case when listings_closed >= v_min_cell then median_observed_days end,
    case when scope = 'overall' and period = 'all' then v_companies end,
    v_method, now()
  from _gi_rows;

  get diagnostics v_rows = row_count;

  return jsonb_build_object('rows', v_rows, 'method', v_method,
                            'companies_in_corpus', v_companies);
end;
$function$;

-- ── 3. A timeout is a failed run ────────────────────────────────────────────

create or replace function public.run_snapshot_sql_refresh(p_task text, p_trigger text default 'cron'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_claimed boolean;
  v_result jsonb;
  v_rows integer;
begin
  if p_task not in (
    'skill_demand', 'job_search', 'ghost_index', 'sector_panel',
    'role_families', 'skill_closeness', 'company_pulse', 'company_directory',
    'public_provenance', 'company_skill_demand'
  ) then
    raise exception 'unsupported SQL snapshot refresh task: %', p_task;
  end if;

  v_claimed := public.claim_snapshot_refresh(p_task, p_trigger, 900);
  if not v_claimed then
    return jsonb_build_object('task', p_task, 'status', 'skipped');
  end if;

  begin
    if p_task = 'skill_demand' then
      select coalesce(to_jsonb(r), '{}'::jsonb)
        into v_result
        from public.refresh_skill_demand_snapshot() r;
    elsif p_task = 'ghost_index' then
      select public.refresh_ghost_index() into v_result;
    elsif p_task = 'sector_panel' then
      select public.refresh_sector_panel() into v_result;
    elsif p_task = 'role_families' then
      select public.refresh_role_family_labels() into v_result;
      v_result := v_result || jsonb_build_object(
        'core_skills', public.refresh_direction_core_skills() -> 'families'
      );
    elsif p_task = 'skill_closeness' then
      select public.refresh_skill_closeness() into v_result;
    elsif p_task = 'company_pulse' then
      select public.refresh_company_pulse() into v_result;
    elsif p_task = 'company_directory' then
      select public.refresh_company_directory() into v_result;
    elsif p_task = 'public_provenance' then
      select public.refresh_public_provenance() into v_result;
    elsif p_task = 'company_skill_demand' then
      select public.refresh_company_skill_demand() into v_result;
    else
      select public.refresh_job_search_index() into v_rows;
      v_result := jsonb_build_object('rows', v_rows);
    end if;

    perform public.finish_snapshot_refresh(p_task, true, v_result, null);
    return jsonb_build_object('task', p_task, 'status', 'succeeded', 'result', v_result);
  -- `others` does not match query_canceled. A statement timeout used to escape
  -- this handler, roll the claim back with the work, and leave the task
  -- 'pending' for the next hourly run to repeat.
  exception when others or query_canceled then
    perform public.finish_snapshot_refresh(p_task, false, '{}'::jsonb, sqlerrm);
    raise warning 'snapshot refresh failed task=% error=%', p_task, sqlerrm;
    return jsonb_build_object('task', p_task, 'status', 'failed', 'error', sqlerrm);
  end;
end;
$function$;

-- ── 4. A failing task backs off ─────────────────────────────────────────────

create or replace function public.finish_snapshot_refresh(p_task text, p_success boolean, p_result jsonb default '{}'::jsonb, p_error text default null::text)
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  update public.snapshot_refresh_state
  set status = case when p_success then 'succeeded' else 'failed' end,
      lease_expires_at = null,
      last_success_at = case when p_success then now() else last_success_at end,
      last_error_at = case when p_success then last_error_at else now() end,
      last_error = case when p_success then null else left(coalesce(p_error, 'unknown error'), 2000) end,
      consecutive_failures = case when p_success then 0 else consecutive_failures + 1 end,
      result = coalesce(p_result, '{}'::jsonb),
      updated_at = now()
  where task = p_task;
$function$;

create or replace function public.claim_snapshot_refresh(p_task text, p_trigger text, p_lease_seconds integer default 900)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_claimed boolean := false;
begin
  with claimable as (
    select s.task
    from public.snapshot_refresh_state s
    where s.task = p_task
      and (
        s.status in ('pending', 'failed')
        or (
          s.status = 'running'
          and coalesce(s.lease_expires_at, '-infinity'::timestamptz) <= now()
        )
      )
      -- A task that keeps failing waits 1h, 2h, 4h ... up to a day after the
      -- start of its last failed run, instead of running every hour. Ten
      -- minutes of grace: the hourly cron lands a few seconds either side.
      and (
        s.consecutive_failures = 0
        or s.started_at is null
        or s.started_at < now() - (
          least(interval '24 hours', interval '1 hour' * power(2, least(s.consecutive_failures - 1, 5)))
          - interval '10 minutes'
        )
      )
    for update skip locked
  )
  update public.snapshot_refresh_state s
  set status = 'running',
      started_at = now(),
      lease_expires_at = now() + make_interval(secs => greatest(60, p_lease_seconds)),
      requested_by = left(coalesce(nullif(btrim(p_trigger), ''), 'unknown'), 80),
      attempts = attempts + 1,
      updated_at = now()
  from claimable c
  where s.task = c.task
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$function$;
