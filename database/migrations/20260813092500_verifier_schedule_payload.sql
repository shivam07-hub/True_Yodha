-- Complete the verifier read model: a claim needs five small fields, so keep
-- them on the schedule row and avoid joining the wide jobs table at all.

ALTER TABLE public.job_verification_schedule
    ADD COLUMN IF NOT EXISTS job_title text,
    ADD COLUMN IF NOT EXISTS apply_url text,
    ADD COLUMN IF NOT EXISTS listing_confidence text;

UPDATE public.job_verification_schedule s
SET job_title = j.job_title,
    apply_url = j.apply_url,
    listing_confidence = j.listing_confidence
FROM public.jobs j
WHERE j.job_id = s.job_id;

CREATE OR REPLACE FUNCTION public.sync_job_verification_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.retired_at IS NULL AND NEW.apply_url LIKE 'http%' THEN
        INSERT INTO public.job_verification_schedule (
            job_id, last_attempt_at, job_title, apply_url, listing_confidence
        ) VALUES (
            NEW.job_id,
            NEW.last_verification_attempt_at,
            NEW.job_title,
            NEW.apply_url,
            NEW.listing_confidence
        )
        ON CONFLICT (job_id) DO UPDATE SET
            last_attempt_at = EXCLUDED.last_attempt_at,
            job_title = EXCLUDED.job_title,
            apply_url = EXCLUDED.apply_url,
            listing_confidence = EXCLUDED.listing_confidence;
    ELSE
        DELETE FROM public.job_verification_schedule WHERE job_id = NEW.job_id;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_job_verification_schedule_jobs ON public.jobs;
CREATE TRIGGER sync_job_verification_schedule_jobs
AFTER INSERT OR UPDATE OF
    last_verification_attempt_at, apply_url, retired_at, job_title, listing_confidence
ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.sync_job_verification_schedule();

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
            s.job_id,
            s.job_title,
            s.apply_url,
            s.listing_confidence,
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
        JOIN public.job_verification_schedule s ON s.job_id = i.job_id
        WHERE (i.application_tracked OR i.shown_until >= now() OR i.matched)
          AND (s.last_attempt_at IS NULL OR s.last_attempt_at < now() - p_priority_stale)
        ORDER BY
            priority_rank ASC,
            s.last_attempt_at ASC NULLS FIRST
        LIMIT (SELECT greatest(1, (claim_limit * 4) / 5) FROM bounds)
        FOR UPDATE OF s SKIP LOCKED
    ),
    global_due AS (
        SELECT
            s.job_id,
            s.job_title,
            s.apply_url,
            s.listing_confidence,
            3 AS priority_rank,
            'corpus'::text AS reason
        FROM public.job_verification_schedule s
        WHERE NOT EXISTS (
              SELECT 1 FROM priority_due p WHERE p.job_id = s.job_id
          )
          AND (s.last_attempt_at IS NULL OR s.last_attempt_at < now() - p_stale)
        ORDER BY s.last_attempt_at ASC NULLS FIRST
        LIMIT (
            SELECT greatest(0, claim_limit - (SELECT count(*) FROM priority_due))
            FROM bounds
        )
        FOR UPDATE OF s SKIP LOCKED
    ),
    due AS (
        SELECT * FROM priority_due
        UNION ALL
        SELECT * FROM global_due
    )
    UPDATE public.job_verification_schedule s
       SET last_attempt_at = now()
      FROM due
     WHERE s.job_id = due.job_id
    RETURNING
        due.job_id,
        due.job_title,
        due.apply_url,
        due.listing_confidence,
        due.reason;
$$;

REVOKE ALL ON FUNCTION public.claim_verify_targets(int, interval, interval)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_verify_targets(int, interval, interval)
    TO service_role;

NOTIFY pgrst, 'reload schema';
