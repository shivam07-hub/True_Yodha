-- Fix the analytics-snapshot dirty-guard marker type.
--
-- 20260614_analytics_snapshot_autorefresh declared source_last_seen as
-- timestamptz, but jobs.last_seen is an integer YYYYMMDD batch marker. Combined
-- with Postgres NULLS-FIRST ordering on DESC, the guard could never persist a
-- real value (it surfaced a null row). Retype to integer to match the source
-- column; the guard query is also fixed app-side to filter nulls before max.
--
-- Current values are all NULL (the guard never wrote a non-null), so USING NULL
-- is lossless.

ALTER TABLE public.market_analytics_snapshot
    ALTER COLUMN source_last_seen TYPE integer USING NULL;

NOTIFY pgrst, 'reload schema';
