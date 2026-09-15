-- Rewrite the files after the thin-ledger DELETE. Cannot run inside a
-- transaction. Locks job_listing_observations, then jobs, while it copies.
VACUUM (FULL, ANALYZE) public.job_listing_observations;
VACUUM (FULL, ANALYZE) public.jobs;
