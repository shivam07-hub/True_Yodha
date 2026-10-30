-- Company skill demand, refreshed in the database from live enriched jobs.
--
-- "What skills is X hiring for?" on every company page reads
-- company_skill_profiles, last written 2026-07-11. The scraper built those rows
-- from a run's own skills, but production imports run --source-only (skills are
-- extracted later, by our worker), so it rightly writes none and nothing else
-- did. This is a Tier-0 snapshot like company_pulse: on the snapshot lease, so
-- the snapshot dead-man watches it, daily (the 48h stale rule), ~20s in-database.
--
-- One observation per refresh, as the scraper's model had one per daily run:
-- trend is this observation against the last, on its thresholds (±25% and ±2).
-- A skill no live job asks for any more goes dormant at 0.
--
-- The July rows are replaced, not carried: they came from one run, and the four
-- company ids that held ten employers mixed their skills (20261029120000).
-- company_skill_run_facts and refresh_company_skill_profiles stay for the
-- scraper's non-source-only path, which production does not run.

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_company_skill_demand()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_now timestamptz := now();
    v_live integer;
    v_dormant integer;
BEGIN
    DROP TABLE IF EXISTS _company_demand;
    CREATE TEMP TABLE _company_demand ON COMMIT DROP AS
    SELECT j.company_id,
           s.skill_id,
           COUNT(DISTINCT j.job_id)::integer AS job_count,
           (COUNT(DISTINCT j.job_id) FILTER (WHERE s.is_primary))::integer AS primary_count,
           ROUND(AVG(s.required_level), 2) AS average_required_level
    FROM public.jobs AS j
    JOIN public.job_skills AS s ON s.job_id = j.job_id
    WHERE public.listing_is_live(j)
      AND j.company_id IS NOT NULL
    GROUP BY j.company_id, s.skill_id;

    -- The page's "Through" date is the company's latest complete scrape.
    DROP TABLE IF EXISTS _company_latest_run;
    CREATE TEMP TABLE _company_latest_run ON COMMIT DROP AS
    SELECT DISTINCT ON (r.company_id) r.company_id, r.id
    FROM public.job_source_runs AS r
    WHERE r.status = 'complete'
      AND r.company_id IS NOT NULL
    ORDER BY r.company_id, r.completed_at DESC;

    INSERT INTO public.company_skill_profiles AS p (
        company_id, skill_id, first_seen_at, last_seen_at, latest_job_count,
        latest_primary_job_count, peak_job_count, observation_run_count,
        average_required_level, trend_direction, latest_source_run_id, updated_at
    )
    SELECT d.company_id, d.skill_id, v_now, v_now, d.job_count,
           d.primary_count, d.job_count, 1,
           d.average_required_level, 'steady', r.id, v_now
    FROM _company_demand AS d
    LEFT JOIN _company_latest_run AS r ON r.company_id = d.company_id
    ON CONFLICT (company_id, skill_id) DO UPDATE SET
        last_seen_at = v_now,
        latest_job_count = EXCLUDED.latest_job_count,
        latest_primary_job_count = EXCLUDED.latest_primary_job_count,
        peak_job_count = GREATEST(p.peak_job_count, EXCLUDED.latest_job_count),
        observation_run_count = p.observation_run_count + 1,
        average_required_level = EXCLUDED.average_required_level,
        trend_direction = CASE
            WHEN EXCLUDED.latest_job_count >= p.latest_job_count * 1.25
             AND EXCLUDED.latest_job_count - p.latest_job_count >= 2 THEN 'emerging'
            WHEN EXCLUDED.latest_job_count <= p.latest_job_count * 0.75
             AND p.latest_job_count - EXCLUDED.latest_job_count >= 2 THEN 'declining'
            ELSE 'steady'
        END,
        latest_source_run_id = EXCLUDED.latest_source_run_id,
        updated_at = v_now;
    GET DIAGNOSTICS v_live = ROW_COUNT;

    UPDATE public.company_skill_profiles AS p
    SET latest_job_count = 0,
        latest_primary_job_count = 0,
        observation_run_count = p.observation_run_count + 1,
        trend_direction = 'dormant',
        updated_at = v_now
    WHERE p.latest_job_count > 0
      AND NOT EXISTS (
          SELECT 1 FROM _company_demand AS d
          WHERE d.company_id = p.company_id AND d.skill_id = p.skill_id
      );
    GET DIAGNOSTICS v_dormant = ROW_COUNT;

    RETURN jsonb_build_object('live', v_live, 'dormant', v_dormant, 'refreshed_at', v_now);
END;
$$;

-- ── on the snapshot lease ───────────────────────────────────────────────────

ALTER TABLE public.snapshot_refresh_state
    DROP CONSTRAINT IF EXISTS snapshot_refresh_state_task_check;
ALTER TABLE public.snapshot_refresh_state
    ADD CONSTRAINT snapshot_refresh_state_task_check
    CHECK (task = ANY (ARRAY['analytics', 'skill_demand', 'job_search',
                             'role_families', 'company_directory', 'ghost_index',
                             'sector_panel', 'skill_closeness', 'company_pulse',
                             'public_provenance', 'company_skill_demand']));

INSERT INTO public.snapshot_refresh_state (task, status, requested_by)
VALUES ('company_skill_demand', 'pending', 'migration_20261029130000')
ON CONFLICT (task) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_snapshot_sql_refresh(
    p_task text,
    p_trigger text DEFAULT 'cron'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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
  exception when others then
    perform public.finish_snapshot_refresh(p_task, false, '{}'::jsonb, sqlerrm);
    raise warning 'snapshot refresh failed task=% error=%', p_task, sqlerrm;
    return jsonb_build_object('task', p_task, 'status', 'failed', 'error', sqlerrm);
  end;
end;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job
   WHERE jobname = 'company-skill-demand-daily-refresh';
END $$;

SELECT cron.schedule(
  'company-skill-demand-daily-refresh',
  '25 21 * * *',
  $cmd$
    select public.request_snapshot_refresh_task('company_skill_demand', 'cron:company-skill-demand');
    select public.run_snapshot_sql_refresh('company_skill_demand', 'cron:company-skill-demand');
  $cmd$
);

-- ── replace the July rows, then observe once ────────────────────────────────

DELETE FROM public.company_skill_profiles WHERE updated_at < now();

SELECT public.run_snapshot_sql_refresh('company_skill_demand', 'migration_20261029130000');

COMMIT;
