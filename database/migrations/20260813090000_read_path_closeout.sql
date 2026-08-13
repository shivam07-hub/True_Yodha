-- #16 production read capacity closeout.
--
-- 1. Stop rebuilding every recommendation exposure/match/application set for
--    every listing-verifier claim. A compact read model is maintained at the
--    write seam and the worker reads that model.
-- 2. Collapse the dependent profile-marker -> exact jobs count chain into one
--    database round trip for /jobs/matches and the other inventory consumers.

CREATE TABLE IF NOT EXISTS public.job_verification_interest (
    job_id text PRIMARY KEY REFERENCES public.jobs(job_id) ON DELETE CASCADE,
    application_tracked boolean NOT NULL DEFAULT false,
    shown_until timestamptz,
    matched boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.job_verification_interest IS
    'Incremental J3 read model for listing-verifier priority. It prevents every claim from rebuilding applications, recent exposures, and matches.';

ALTER TABLE public.job_verification_interest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.job_verification_interest FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_verification_interest TO service_role;

CREATE INDEX IF NOT EXISTS idx_job_verification_interest_shown
    ON public.job_verification_interest (shown_until DESC, job_id)
    WHERE shown_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_verification_interest_application
    ON public.job_verification_interest (job_id)
    WHERE application_tracked IS TRUE;

CREATE INDEX IF NOT EXISTS idx_job_verification_interest_matched
    ON public.job_verification_interest (job_id)
    WHERE matched IS TRUE;

CREATE OR REPLACE FUNCTION public.refresh_job_verification_interest(p_job_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_application_tracked boolean;
    v_shown_until timestamptz;
    v_matched boolean;
BEGIN
    IF p_job_id IS NULL THEN
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.job_applications a
        WHERE a.job_id = p_job_id
          AND COALESCE(a.status, '') NOT IN ('rejected', 'withdrawn', 'closed')
    ) INTO v_application_tracked;

    SELECT max(e.shown_at) + interval '30 days'
    FROM public.job_recommendation_exposures e
    WHERE e.job_id = p_job_id
    INTO v_shown_until;

    SELECT EXISTS (
        SELECT 1
        FROM public.user_job_matches m
        WHERE m.job_id = p_job_id
    ) INTO v_matched;

    IF NOT v_application_tracked
       AND (v_shown_until IS NULL OR v_shown_until < now())
       AND NOT v_matched THEN
        DELETE FROM public.job_verification_interest WHERE job_id = p_job_id;
        RETURN;
    END IF;

    INSERT INTO public.job_verification_interest (
        job_id, application_tracked, shown_until, matched, updated_at
    ) VALUES (
        p_job_id, v_application_tracked, v_shown_until, v_matched, now()
    )
    ON CONFLICT (job_id) DO UPDATE SET
        application_tracked = EXCLUDED.application_tracked,
        shown_until = EXCLUDED.shown_until,
        matched = EXCLUDED.matched,
        updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_job_verification_interest(text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_job_verification_interest(text)
    TO service_role;

CREATE OR REPLACE FUNCTION public.sync_job_verification_interest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.job_id IS DISTINCT FROM NEW.job_id THEN
        PERFORM public.refresh_job_verification_interest(OLD.job_id);
    END IF;
    PERFORM public.refresh_job_verification_interest(
        CASE WHEN TG_OP = 'DELETE' THEN OLD.job_id ELSE NEW.job_id END
    );
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_job_verification_interest()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_job_verification_interest_applications
    ON public.job_applications;
CREATE TRIGGER sync_job_verification_interest_applications
AFTER INSERT OR UPDATE OF job_id, status OR DELETE ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.sync_job_verification_interest();

DROP TRIGGER IF EXISTS sync_job_verification_interest_exposures
    ON public.job_recommendation_exposures;
CREATE TRIGGER sync_job_verification_interest_exposures
AFTER INSERT OR UPDATE OF job_id, shown_at OR DELETE ON public.job_recommendation_exposures
FOR EACH ROW EXECUTE FUNCTION public.sync_job_verification_interest();

DROP TRIGGER IF EXISTS sync_job_verification_interest_matches
    ON public.user_job_matches;
CREATE TRIGGER sync_job_verification_interest_matches
AFTER INSERT OR UPDATE OF job_id OR DELETE ON public.user_job_matches
FOR EACH ROW EXECUTE FUNCTION public.sync_job_verification_interest();

-- One-time projection. Subsequent writes touch one job_id through the triggers.
INSERT INTO public.job_verification_interest (
    job_id, application_tracked, shown_until, matched, updated_at
)
SELECT
    p.job_id,
    bool_or(p.priority_rank = 0),
    max(p.shown_until),
    bool_or(p.priority_rank = 2),
    now()
FROM (
    SELECT a.job_id, 0 AS priority_rank, NULL::timestamptz AS shown_until
    FROM public.job_applications a
    WHERE a.job_id IS NOT NULL
      AND COALESCE(a.status, '') NOT IN ('rejected', 'withdrawn', 'closed')
    UNION ALL
    SELECT e.job_id, 1, max(e.shown_at) + interval '30 days'
    FROM public.job_recommendation_exposures e
    WHERE e.job_id IS NOT NULL
    GROUP BY e.job_id
    HAVING max(e.shown_at) >= now() - interval '30 days'
    UNION ALL
    SELECT m.job_id, 2, NULL::timestamptz
    FROM public.user_job_matches m
    WHERE m.job_id IS NOT NULL
    GROUP BY m.job_id
) p
GROUP BY p.job_id
ON CONFLICT (job_id) DO UPDATE SET
    application_tracked = EXCLUDED.application_tracked,
    shown_until = EXCLUDED.shown_until,
    matched = EXCLUDED.matched,
    updated_at = EXCLUDED.updated_at;

CREATE OR REPLACE FUNCTION public.claim_verify_targets(
    p_limit int DEFAULT 200,
    p_stale interval DEFAULT '7 days',
    p_priority_stale interval DEFAULT '24 hours'
)
RETURNS TABLE (
    job_id text,
    job_title text,
    apply_url text,
    listing_confidence text,
    verification_priority text
)
LANGUAGE sql
SET search_path = ''
AS $$
    WITH bounds AS (
        SELECT greatest(1, least(p_limit, 1000)) AS claim_limit
    ),
    priority_due AS (
        SELECT
            j.job_id,
            CASE
                WHEN i.application_tracked THEN 0
                WHEN i.shown_until >= now() THEN 1
                ELSE 2
            END AS priority_rank,
            CASE
                WHEN i.application_tracked THEN 'tracked'
                WHEN i.shown_until >= now() THEN 'shown'
                ELSE 'matched'
            END AS reason
        FROM public.job_verification_interest i
        JOIN public.jobs j ON j.job_id = i.job_id
        WHERE (i.application_tracked OR i.shown_until >= now() OR i.matched)
          AND j.retired_at IS NULL
          AND j.apply_url LIKE 'http%'
          AND (
              j.last_verification_attempt_at IS NULL
              OR j.last_verification_attempt_at < now() - p_priority_stale
          )
        ORDER BY
            priority_rank ASC,
            j.last_verification_attempt_at ASC NULLS FIRST
        LIMIT (SELECT greatest(1, (claim_limit * 4) / 5) FROM bounds)
        FOR UPDATE OF j SKIP LOCKED
    ),
    global_due AS (
        SELECT j.job_id, 3 AS priority_rank, 'corpus'::text AS reason
        FROM public.jobs j
        WHERE j.retired_at IS NULL
          AND j.apply_url LIKE 'http%'
          AND NOT EXISTS (
              SELECT 1 FROM priority_due p WHERE p.job_id = j.job_id
          )
          AND (
              j.last_verification_attempt_at IS NULL
              OR j.last_verification_attempt_at < now() - p_stale
          )
        ORDER BY j.last_verification_attempt_at ASC NULLS FIRST
        LIMIT (
            SELECT greatest(0, claim_limit - (SELECT count(*) FROM priority_due))
            FROM bounds
        )
        FOR UPDATE OF j SKIP LOCKED
    ),
    due AS (
        SELECT * FROM priority_due
        UNION ALL
        SELECT * FROM global_due
    )
    UPDATE public.jobs j
       SET last_verification_attempt_at = now()
      FROM due
     WHERE j.job_id = due.job_id
    RETURNING
        j.job_id,
        j.job_title,
        j.apply_url,
        j.listing_confidence,
        due.reason;
$$;

REVOKE ALL ON FUNCTION public.claim_verify_targets(int, interval, interval)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_verify_targets(int, interval, interval)
    TO service_role;

CREATE OR REPLACE FUNCTION public.count_new_jobs_for_user(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH marker AS (
        SELECT COALESCE(
            p.last_match_run_at,
            (
                SELECT max(m.computed_at)
                FROM public.user_job_matches m
                WHERE m.user_id = p_user_id
            )
        ) AS ran_at
        FROM public.user_profiles p
        WHERE p.id = p_user_id
    )
    SELECT COALESCE((
        SELECT count(*)
        FROM public.jobs j
        CROSS JOIN marker m
        WHERE m.ran_at IS NOT NULL
          AND j.is_active IS TRUE
          AND j.ingested_at > m.ran_at
    ), 0)::bigint;
$$;

REVOKE ALL ON FUNCTION public.count_new_jobs_for_user(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_new_jobs_for_user(uuid)
    TO service_role;

NOTIFY pgrst, 'reload schema';
