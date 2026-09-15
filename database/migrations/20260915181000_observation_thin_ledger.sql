-- Thin the listing-evidence ledger. Close / first miss / user reports stay.
-- Verifier pings (error, blocked, timeout, redirected, seen_live) go. Ghost
-- Index keeps one latest scraper seen_live per job plus live last_verified_live_at.

BEGIN;

CREATE TEMP TABLE keep_latest_seen_live ON COMMIT DROP AS
SELECT DISTINCT ON (job_id) id
FROM public.job_listing_observations
WHERE observer = 'scraper' AND result = 'seen_live'
ORDER BY job_id, observed_at DESC, id DESC;

CREATE TEMP TABLE keep_first_missing ON COMMIT DROP AS
SELECT DISTINCT ON (job_id) id
FROM public.job_listing_observations
WHERE observer = 'scraper' AND result = 'source_missing'
ORDER BY job_id, observed_at ASC, id ASC;

DELETE FROM public.job_listing_observations o
WHERE NOT (
    o.observer = 'user'
    OR o.result = 'closed'
    OR o.id IN (SELECT id FROM keep_latest_seen_live)
    OR o.id IN (SELECT id FROM keep_first_missing)
);

DROP INDEX IF EXISTS public.idx_job_listing_observations_verifier_productive;

CREATE OR REPLACE VIEW public.listing_feed_presence AS
SELECT
    job_id,
    max(last_in_feed) AS last_in_feed,
    min(dropped_from_feed) AS dropped_from_feed,
    sum(feed_observations)::bigint AS feed_observations
FROM (
    SELECT
        job_id,
        last_verified_live_at AS last_in_feed,
        NULL::timestamptz AS dropped_from_feed,
        0 AS feed_observations
    FROM public.jobs
    WHERE last_verified_live_at IS NOT NULL
    UNION ALL
    SELECT
        job_id,
        max(observed_at) FILTER (WHERE result = 'seen_live'),
        min(observed_at) FILTER (WHERE result = 'source_missing'),
        count(*) FILTER (WHERE result = 'seen_live')
    FROM public.job_listing_observations
    WHERE observer = 'scraper'
    GROUP BY job_id
) presence
GROUP BY job_id;

COMMENT ON VIEW public.listing_feed_presence IS
    'Feed presence for Ghost Index. Live rows use last_verified_live_at '
    '(not last_seen). Unloaded rows use the frozen scraper ledger.';

CREATE OR REPLACE FUNCTION public.verifier_health_snapshot(
    p_priority_stale interval DEFAULT '24 hours'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'last_attempt', (
            SELECT j.last_verification_attempt_at
            FROM public.jobs j
            WHERE j.retired_at IS NULL
              AND j.apply_url LIKE 'http%'
            ORDER BY j.last_verification_attempt_at DESC NULLS LAST
            LIMIT 1
        ),
        'last_productive', (
            SELECT j.last_conclusive_verification_at
            FROM public.jobs j
            WHERE j.retired_at IS NULL
              AND j.last_conclusive_verification_at IS NOT NULL
            ORDER BY j.last_conclusive_verification_at DESC
            LIMIT 1
        ),
        'priority_due', NULL
    );
$$;

COMMENT ON FUNCTION public.verifier_health_snapshot(interval) IS
    'Cheap verifier dead-man heartbeat. Productive stamp is the jobs row, '
    'not the observation diary.';

COMMENT ON TABLE public.job_listing_observations IS
    'Thin listing evidence for Ghost Index: closes, first scraper miss, '
    'user reports, and one frozen seen_live per job. Verifier pings log on Railway.';

NOTIFY pgrst, 'reload schema';
COMMIT;
