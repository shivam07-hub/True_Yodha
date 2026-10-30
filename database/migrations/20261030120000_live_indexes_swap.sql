-- Listing Liveness: finish the index swap begun in 20261027120500.
--
-- Prod took the `is_active IS TRUE` reads in #345 (2026-10-29). Measured
-- 2026-10-30 17:52 UTC: the four bare-spelled indexes sat at exactly the
-- 2026-10-27 baseline (458 / 23,346 / 2,154 / 1,337 scans), last used 10-27
-- 18:13, while the `_v2` twins kept moving. idx_jobs_feed_active_first_seen has
-- the same columns as idx_jobs_live_first_seen_job_id and was last used 09-30.
--
-- CONCURRENTLY (no lock), one statement at a time, outside a transaction.

drop index concurrently if exists public.idx_jobs_candidate_band;
alter index public.idx_jobs_candidate_band_v2 rename to idx_jobs_candidate_band;

drop index concurrently if exists public.idx_jobs_lower_company_active_jobid;
alter index public.idx_jobs_lower_company_active_jobid_v2 rename to idx_jobs_lower_company_active_jobid;

drop index concurrently if exists public.idx_jobs_live_company_first_seen;
alter index public.idx_jobs_live_company_first_seen_v2 rename to idx_jobs_live_company_first_seen;

drop index concurrently if exists public.idx_jobs_feed_active_first_seen;
