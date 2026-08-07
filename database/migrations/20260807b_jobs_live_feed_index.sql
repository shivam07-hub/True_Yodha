-- The default job feed — sort=fresh, no filters — was the fourth instance in
-- two days of the same trap: a query the planner cannot serve as an ordered
-- index scan, so it visits every matching row before it can sort and stop at
-- LIMIT. This is the read a genuinely new user's browser sends on arrival —
-- `pickDefaultSort(hasCv, hasTargetRoles)` in the frontend already returns
-- "fresh" for exactly a no-CV user, so this IS the Finlatics landing query.
--
-- Measured on prod, identical query and rows:
--
--   is_active AND listing_confidence='active' ORDER BY first_seen DESC LIMIT 20
--     before   Bitmap Heap Scan, BitmapAnd of two separate indexes,
--              11,207 rows heap-fetched to sort 20            3,080ms
--     after    Index Scan, idx_jobs_live_first_seen_job_id       3.2ms
--
-- A single-column (first_seen DESC) partial index was tried first and was NOT
-- enough: first_seen has only 17 distinct values across 11,207 live rows (a
-- date-granularity marker, not a timestamp), so the query's tiebreaker
-- `ORDER BY first_seen DESC, job_id DESC` forced an Incremental Sort within
-- each ~660-row day-bucket — 937ms, still failing the budget. The composite
-- index below matches the query's actual ORDER BY exactly, both columns, so
-- Postgres can walk it in output order with no in-memory sort at all.
--
-- Same index also serves feed_jobs' OTHER path — the in-Python fit/exclusion
-- candidate fetch (`ORDER BY first_seen DESC LIMIT 500`, repositories/jobs.py
-- `_FEED_PERSONAL_CAP`) — used whenever a user has any saved/dismissed jobs
-- or a target career band. Measured: 26ms for the 500-row fetch, down from
-- the same multi-second BitmapAnd path.
--
-- Predicate is a literal match to the query's own WHERE clause (`is_active IS
-- TRUE AND listing_confidence = 'active'`), so — unlike the two dead partial
-- indexes fixed 2026-08-06/07 — the planner does not need to prove anything
-- beyond textual equality to use it.
--
-- Applied CONCURRENTLY (no write lock). CREATE INDEX CONCURRENTLY cannot run
-- inside a transaction, so re-running this file needs it outside one.

create index concurrently if not exists idx_jobs_live_first_seen_job_id
  on public.jobs (first_seen desc, job_id desc)
  where is_active is true and listing_confidence = 'active';
