-- 20260809_jobs_autovacuum_visibility_map.sql
--
-- Keep `jobs`' visibility map fresh, so an Index Only Scan is actually index-only.
--
-- WHY (measured on prod, 2026-08-09, not theorised):
--
--   `new_inventory.count_for_user` is the slowest member of the /jobs/matches
--   fan-out (8,348ms of an 8,350ms wave on 2026-08-08). Its query — count live
--   jobs with `ingested_at > <user marker>` — has a correct plan and a usable
--   index (`idx_jobs_ingested_at_active`), and warm on an idle DB it runs in
--   16ms. Its 28-day production distribution was min 0ms / mean 217ms /
--   stddev 930ms / max 7,399ms: the same query, the same plan, 460x apart.
--
--   The cause was the visibility map, not the query:
--
--       EXPLAIN (ANALYZE, BUFFERS), median-staleness marker, before:
--         Index Only Scan ... rows=53982
--         Heap Fetches: 21438        <- 40% of rows fell back to the heap
--         Buffers: shared hit=10087  <- 79 MB touched, per call
--
--       after one VACUUM (ANALYZE) public.jobs:
--         Heap Fetches: 705          (30x)
--         Buffers: shared hit=472    (21x, 3.7 MB)
--
--   shared_buffers on this instance is 224 MB. `jobs` is 171 MB of heap plus
--   248 MB of indexes. A read that touches 79 MB per call evicts a third of the
--   cache every time it runs — which is why unrelated endpoints (/jobs/feed,
--   /public/stats) degraded in the same seconds, and why the same statement's
--   own min is 0ms.
--
--   The map stales continuously, not once: heap fetches on this query grew
--   19,675 -> 21,438 in fifteen minutes of ordinary job-listing-verifier and
--   skill-engine write traffic. Autovacuum's default 0.2 scale factor waits for
--   ~18,000 dead tuples on this table, which left hours-long windows where the
--   map was badly stale. 0.05 trades ~4x more background vacuum passes (~35s of
--   I/O each) for a read path that stops streaming the table through the cache.
--
-- Additive and reversible: `ALTER TABLE public.jobs RESET (...)` restores the
-- cluster defaults. No lock beyond a brief ACCESS EXCLUSIVE on the catalog row,
-- no table rewrite, no data change.

ALTER TABLE public.jobs SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.05,
    autovacuum_vacuum_insert_scale_factor = 0.05
);
