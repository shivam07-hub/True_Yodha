-- Daily auto-refresh of the market analytics snapshot (B-smart).
--
-- Problem: the landing-page counters (jobs/companies) are served from the
-- market_analytics_snapshot row, which only updated when the scraper repo
-- remembered to POST /jobs/analytics/refresh-snapshot. It didn't, so the
-- public numbers went stale ("batch 2026-05-27").
--
-- Fix: a daily pg_cron job calls the same endpoint with a cheap dirty-guard.
-- The guard compares a (job_count, max(last_seen)) marker against the marker
-- stored on the last refresh; the expensive Python compile (full jobs scan)
-- runs ONLY when the jobs table actually changed (~weekly batches). Idle days
-- cost two index-backed marker queries — effectively free. No cross-repo
-- coupling, self-healing.
--
-- The compiler lives in Python (industry normalization, location hydration,
-- velocity binning) and is not expressible in SQL, so the cron reaches the API
-- via pg_net rather than recomputing in-database.

-- 1) Marker columns the dirty-guard reads/writes (see persist_analytics_snapshot).
ALTER TABLE public.market_analytics_snapshot
    ADD COLUMN IF NOT EXISTS source_job_count integer,
    ADD COLUMN IF NOT EXISTS source_last_seen timestamptz;

-- 2) Index backing the max(last_seen) marker probe + existing feed-timestamp read.
CREATE INDEX IF NOT EXISTS idx_jobs_last_seen
    ON public.jobs (last_seen DESC);

-- 3) Extensions for scheduling + outbound HTTP from Postgres.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 4) Store the refresh secret + API base URL in Supabase Vault so they don't sit
--    in the cron command text. Run these ONCE with real values (idempotent):
--
--    SELECT vault.create_secret('https://api.himyro.com', 'myro_api_base_url');
--    SELECT vault.create_secret('<MYRO_ANALYTICS_REFRESH_SECRET>', 'myro_analytics_refresh_secret');
--
--    (To rotate later: vault.update_secret(id, new_value).)

-- 5) Daily cron — 06:15 UTC (after the weekly batch window, off-peak for India
--    traffic). Posts to the guarded endpoint; the backend skips the compile when
--    nothing changed. force is omitted (defaults false) so the guard runs.
SELECT cron.schedule(
    'analytics-snapshot-daily-refresh',
    '15 6 * * *',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets
                WHERE name = 'myro_api_base_url')
               || '/jobs/analytics/refresh-snapshot',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Myro-Refresh-Secret',
            (SELECT decrypted_secret FROM vault.decrypted_secrets
             WHERE name = 'myro_analytics_refresh_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
    );
    $$
);

NOTIFY pgrst, 'reload schema';
