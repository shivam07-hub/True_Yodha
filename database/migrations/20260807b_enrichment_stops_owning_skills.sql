-- Forward flow: the next scrape must not rebuild the corpus fault we just measured.
--
-- MEASURED STATE, 2026-08-07. 55,958 of 61,280 skilled jobs (91.3%) carry only
-- `evidence_source = 'enrichment'` rows, and `is_primary` is true on 94.2% of
-- them. It is a constant, not a signal. Read through S5's gating bar, Accenture
-- x Banking Services reports every skill as a 100% must-have, "Ingenuity" and
-- "Global Perspective" included. `role_family_market_skills` and
-- `role_family_aspiration_skills` already count that constant as demand.
--
-- The constant is written HERE, and would be written again on the next run:
--
--     DELETE FROM public.job_skills WHERE job_id = p_job_id;
--     INSERT INTO public.job_skills (job_id, skill_id, is_primary, required_level)
--     SELECT p_job_id, skill_id, TRUE, required_level FROM _incoming_job_skills
--
-- Two faults in three lines. The hard-coded TRUE is the constant itself. The
-- DELETE is worse: enrichment runs AFTER Stage A on a new job, so it deletes
-- the floor's read of the document — and Stage B's verdicts with it — and
-- replaces them with that constant. `has_skill_floor` stays true throughout, so
-- Stage A never gets the job back. Every newly scraped job would end up
-- zone-blind, permanently, by design.
--
-- 20260806b guarded the empty case (`IF v_incoming > 0`). A non-empty
-- enrichment still wipes a judged floor, which is the case that matters now
-- that Stage A and Stage B exist.
--
-- THE SPLIT. Lock 1: the scraper "stops owning 'does this job have skills at
-- all'". Enrichment keeps what only it produces — the summary and the role
-- domain. `job_skills` belongs to Stage A (position) and Stage B (judgment),
-- which read the same taxonomy and record WHERE and HOW DEEP. One writer, one
-- answer.
--
-- THE TERMINAL CONDITION MOVES WITH IT. 20260806b made `complete` assert a
-- skill row because enrichment was then the skills writer — `complete` was a
-- claim about the summary while the thing we sell was silently missing. Once
-- enrichment no longer writes skills, that same assertion inverts into the
-- fault the ownership contract names: enrichment would stamp `not_applicable`
-- on a job for the sole reason that STAGE A had not run yet, releasing it on
-- the strength of another stage's timing. So `complete` now asserts exactly
-- what enrichment itself produced, which the early RETURN FALSE already
-- guarantees is non-empty. The floor gap has its own owner — the dead-man
-- heartbeat in `skill_floor_heartbeat` — and does not need enrichment to
-- report it second-hand.

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
    v_applied BOOLEAN := FALSE;
BEGIN
    -- `p_skills` is still accepted so the worker's call signature does not
    -- change, and is deliberately ignored. The parameter stays as the record of
    -- what enrichment used to own; dropping it would break the deployed worker
    -- mid-run for no gain.
    IF NOT (
        NULLIF(btrim(COALESCE(p_job_summary, '')), '') IS NOT NULL
        AND NULLIF(btrim(COALESCE(p_role_domain, '')), '') IS NOT NULL
    ) THEN
        RETURN FALSE;
    END IF;

    UPDATE public.jobs
    SET job_summary = NULLIF(btrim(COALESCE(p_job_summary, '')), ''),
        role_domain = NULLIF(btrim(COALESCE(p_role_domain, '')), ''),
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

    IF NOT COALESCE(v_applied, FALSE) THEN
        RETURN FALSE;
    END IF;

    UPDATE public.jobs
    SET enrichment_status = 'complete',
        enrichment_last_error = NULL
    WHERE job_id = p_job_id
      AND source_content_hash = p_source_content_hash;

    RETURN TRUE;
END
$function$;

-- `main_skills` is the name mirror the job cards, the skill facet and the gap
-- all read. Enrichment used to write it from its own list while `job_skills`
-- came from somewhere else — two answers to "what skills does this job need",
-- which is the coupling this engine keeps removing. It now derives from
-- `job_skills` in the same trigger that already maintains `role_family` and
-- `has_skill_floor`, so the chips a user sees and the rows the matcher ranks
-- cannot disagree.
--
-- Ordered by the zone first: what the posting gates on leads the chip row.
-- Capped at 12 — the LLM path capped at 10, and Stage A can emit up to 12 per
-- zone, so an uncapped mirror would triple every card's payload.
CREATE OR REPLACE FUNCTION public.refresh_job_role_family()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    affected_job_id TEXT;
    resolved_family TEXT;
    has_floor BOOLEAN;
    resolved_main_skills TEXT[];
BEGIN
    affected_job_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.job_id ELSE NEW.job_id END;
    resolved_family := public.role_family_for_job(affected_job_id);
    has_floor := EXISTS (
        SELECT 1 FROM public.job_skills WHERE job_id = affected_job_id
    );

    SELECT COALESCE(array_agg(named.taxonomy_key ORDER BY named.rank), ARRAY[]::TEXT[])
    INTO resolved_main_skills
    FROM (
        SELECT skill.taxonomy_key,
               ROW_NUMBER() OVER (
                   ORDER BY job_skill.is_primary DESC,
                            job_skill.required_level DESC,
                            skill.taxonomy_key ASC
               ) AS rank
        FROM public.job_skills AS job_skill
        JOIN public.skills AS skill ON skill.id = job_skill.skill_id
        WHERE job_skill.job_id = affected_job_id
        -- The subquery repeats the window's ordering rather than leaning on it:
        -- a bare LIMIT over an unordered subquery takes 12 ARBITRARY rows and
        -- only then ranks them, which drops must-haves at random.
        ORDER BY job_skill.is_primary DESC,
                 job_skill.required_level DESC,
                 skill.taxonomy_key ASC
        LIMIT 12
    ) AS named;

    UPDATE public.jobs
    SET role_family = resolved_family,
        has_skill_floor = has_floor,
        main_skills = resolved_main_skills
    WHERE job_id = affected_job_id
      AND (role_family IS DISTINCT FROM resolved_family
           OR has_skill_floor IS DISTINCT FROM has_floor
           OR main_skills IS DISTINCT FROM resolved_main_skills);
    RETURN NULL;
END;
$function$;
