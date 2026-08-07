-- apply_job_enrichment was the root cause of 1,088 prod jobs stamped
-- `complete` while carrying zero job_skills rows.
--
-- The old body did, in order:
--     UPDATE jobs SET ... enrichment_status = 'complete' ...   -- gated ONLY on
--                                                              -- job_summary + role_domain
--     DELETE FROM job_skills WHERE job_id = p_job_id;          -- unconditional
--     INSERT ... SELECT ... FROM matched;                      -- no-op if empty
--
-- Two independent faults. Skills were never part of the terminal condition, so
-- "complete" was a claim about the summary, not about the thing we sell. And
-- the DELETE ran before the INSERT was known to have rows, so a model returning
-- nothing did not merely fail to add skills — it removed the skills the job
-- already had. With a deterministic Stage A floor now writing job_skills at
-- ingest, that second fault would delete the floor on every empty enrichment.
--
-- Two changes, both narrow:
--   1. job_skills is replaced only when the incoming set is non-empty.
--   2. `complete` is stamped only if the job ends the call holding at least one
--      skill row. Otherwise the row lands on the existing `not_applicable`
--      terminal state with a reason, so it is visible instead of silent, and
--      the worker does not retry it forever.
--
-- Behaviour when the model DOES return skills is unchanged.

CREATE OR REPLACE FUNCTION public.apply_job_enrichment(
    p_job_id TEXT,
    p_source_content_hash TEXT,
    p_job_summary TEXT,
    p_role_domain TEXT,
    p_skills JSONB,
    p_model TEXT,
    p_version TEXT,
    p_job_content_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
    v_main_skills TEXT[] := ARRAY[]::TEXT[];
    v_incoming INTEGER := 0;
    v_final_skill_count INTEGER := 0;
    v_applied BOOLEAN := FALSE;
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS _incoming_job_skills (
        skill_id INTEGER, skill_name TEXT, required_level SMALLINT, ordinality BIGINT
    ) ON COMMIT DROP;
    DELETE FROM _incoming_job_skills;

    INSERT INTO _incoming_job_skills (skill_id, skill_name, required_level, ordinality)
    WITH parsed AS (
        SELECT item.ordinality, item.value ->> 'name' AS skill_name,
            CASE WHEN (item.value ->> 'required_level') ~ '^[1-4]$'
                THEN (item.value ->> 'required_level')::SMALLINT ELSE 2::SMALLINT END AS required_level
        FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(COALESCE(p_skills, '[]'::JSONB)) = 'array'
                THEN COALESCE(p_skills, '[]'::JSONB) ELSE '[]'::JSONB END
        ) WITH ORDINALITY AS item(value, ordinality)
        WHERE jsonb_typeof(item.value) = 'object'
          AND NULLIF(btrim(item.value ->> 'name'), '') IS NOT NULL
    )
    SELECT DISTINCT ON (s.id) s.id, s.taxonomy_key, p.required_level, p.ordinality
    FROM parsed AS p
    JOIN public.skills AS s ON s.taxonomy_key = p.skill_name
    ORDER BY s.id, p.ordinality;

    SELECT COUNT(*)::INTEGER INTO v_incoming FROM _incoming_job_skills;
    SELECT COALESCE(array_agg(skill_name ORDER BY ordinality), ARRAY[]::TEXT[])
    INTO v_main_skills FROM _incoming_job_skills;

    IF NOT (
        NULLIF(btrim(COALESCE(p_job_summary, '')), '') IS NOT NULL
        AND NULLIF(btrim(COALESCE(p_role_domain, '')), '') IS NOT NULL
    ) THEN
        RETURN FALSE;
    END IF;

    -- The claim check (`enrichment_status = 'processing'`) still gates the write,
    -- so a row served to one worker cannot be applied by another. The status
    -- itself is deliberately NOT set here — it is decided below, once the skill
    -- count for this job is a fact rather than an assumption.
    UPDATE public.jobs
    SET job_summary = NULLIF(btrim(COALESCE(p_job_summary, '')), ''),
        role_domain = NULLIF(btrim(COALESCE(p_role_domain, '')), ''),
        -- The back-compat name arrays move only alongside the rows they mirror.
        -- Overwriting them on an empty result is the same destruction as the
        -- unconditional DELETE below, one column over.
        main_skills = CASE WHEN v_incoming > 0 THEN v_main_skills ELSE main_skills END,
        side_skills = CASE WHEN v_incoming > 0 THEN ARRAY[]::TEXT[] ELSE side_skills END,
        enriched_source_hash = p_source_content_hash,
        job_content_hash = p_job_content_hash,
        enrichment_model = p_model,
        enrichment_version = p_version,
        enrichment_started_at = COALESCE(enrichment_started_at, now()),
        enriched_at = now(),
        enrichment_priority_requested_at = NULL
    WHERE job_id = p_job_id
      AND source_content_hash = p_source_content_hash
      AND is_active IS TRUE
      AND enrichment_status = 'processing'
    RETURNING TRUE INTO v_applied;
    IF NOT COALESCE(v_applied, FALSE) THEN RETURN FALSE; END IF;

    -- Replace only when there is something to put back. An empty result is not
    -- evidence the job has no skills, so it must never remove the ones it has.
    IF v_incoming > 0 THEN
        DELETE FROM public.job_skills WHERE job_id = p_job_id;
        INSERT INTO public.job_skills (job_id, skill_id, is_primary, required_level)
        SELECT p_job_id, skill_id, TRUE, required_level FROM _incoming_job_skills
        ON CONFLICT (job_id, skill_id) DO UPDATE SET
            is_primary = EXCLUDED.is_primary,
            required_level = EXCLUDED.required_level;
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_final_skill_count
    FROM public.job_skills WHERE job_id = p_job_id;

    UPDATE public.jobs
    SET enrichment_status = CASE WHEN v_final_skill_count > 0 THEN 'complete' ELSE 'not_applicable' END,
        enrichment_last_error = CASE
            WHEN v_final_skill_count > 0 THEN NULL
            ELSE 'enrichment produced no taxonomy skills' END
    WHERE job_id = p_job_id
      AND source_content_hash = p_source_content_hash;

    RETURN v_final_skill_count > 0;
END
$function$;

REVOKE ALL ON FUNCTION public.apply_job_enrichment(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_job_enrichment(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) TO service_role;
