-- Revert every listing closed on a Workday URL that could never have addressed it.
--
-- Workday routes by tenant site: <tenant>.<pod>.myworkdayjobs.com/[locale/]<site>/job/…
-- 9,635 rows across 41 companies carry a URL with <site> missing, so the path
-- starts at /job/ and the tenant router 404s it whether the role is open or not.
-- The verifier read that blanket 404 as strong per-job closure — Accenture
-- "closed" 1,832 openings in 48 hours, DBS 129/129, Wells Fargo 118/118. The
-- same URLs answer HTTP 200 once <site> is restored, so the roles are live and
-- the verdict was about our data, never about the jobs.
--
-- Restores the exact pre-verifier ingest state (uncertain / is_active / no
-- confidence_reason), because the verifier never had a valid say. `uncertain`,
-- not `active`: reverting a claim we could not support does not license the
-- opposite claim. `confidence_reason` records the revert so the set stays
-- findable. Nothing is deleted; `job_listing_observations` keeps the original
-- 404 evidence intact.
--
-- Urgency: retire_closed_jobs() DELETEs rows whose deletion_eligible_at has
-- passed. Nine of these were already eligible and the rest come due from
-- 2026-09-07 on. They survived only because the scraper has been down since July
-- and the function's join to a completed job_source_run found nothing — an
-- accident, not a safeguard.

WITH parsed AS (
    SELECT
        job_id,
        CASE
            WHEN (string_to_array(trim(BOTH '/' FROM regexp_replace(apply_url, '^https?://[^/]+', '')), '/'))[1]
                 ~ '^[a-z]{2}(-[a-zA-Z]{2})?$'
            THEN (string_to_array(trim(BOTH '/' FROM regexp_replace(apply_url, '^https?://[^/]+', '')), '/'))[2:]
            ELSE  string_to_array(trim(BOTH '/' FROM regexp_replace(apply_url, '^https?://[^/]+', '')), '/')
        END AS segments
    FROM public.jobs
    WHERE apply_url ILIKE '%myworkdayjobs.com%'
      AND listing_confidence = 'closed'
      AND confidence_reason = 'workday_verifier_closed'
),
unroutable AS (
    SELECT job_id FROM parsed
    WHERE coalesce(array_length(segments, 1), 0) < 2 OR segments[1] = 'job'
)
UPDATE public.jobs j
   SET listing_confidence            = 'uncertain',
       confidence_reason             = 'unroutable_url_close_reverted',
       is_active                     = TRUE,
       quarantined_at                = NULL,
       quarantine_until              = NULL,
       deletion_eligible_at          = NULL,
       retired_at                    = NULL,
       -- The "conclusive" observation concluded nothing, so the clock that
       -- vouches for a check must not carry it. These rows re-enter the queue.
       last_conclusive_verification_at = NULL,
       consecutive_verify_failures   = 0,
       lifecycle_updated_at          = now()
  FROM unroutable u
 WHERE j.job_id = u.job_id;
