-- Listing Liveness: partial indexes spelled the way public.listing_is_live
-- inlines (`is_active IS TRUE`). Postgres cannot prove `is_active IS TRUE`
-- from a bare `is_active` predicate, or the reverse: measured 2026-10-27, the
-- candidate-band read seq-scanned once routed through the function. These
-- three replace the bare-spelled copies. Applied with CONCURRENTLY (no lock),
-- one statement at a time, outside a transaction.
--
-- The old bare-spelled indexes (idx_jobs_candidate_band,
-- idx_jobs_lower_company_active_jobid, idx_jobs_live_company_first_seen) and
-- the duplicate idx_jobs_feed_active_first_seen (same columns as
-- idx_jobs_live_first_seen_job_id) are dropped only after the Python live
-- filter ships with `is_active IS TRUE` — PostgREST's `is_active = true` still
-- uses them until then.

create index concurrently if not exists idx_jobs_candidate_band_v2
  on public.jobs using btree (career_band, job_id)
  where ((is_active is true) and (listing_confidence = 'active'::text) and (apply_url is not null));

create index concurrently if not exists idx_jobs_lower_company_active_jobid_v2
  on public.jobs using btree (lower(company_name), job_id)
  where ((is_active is true) and (listing_confidence = 'active'::text));

create index concurrently if not exists idx_jobs_live_company_first_seen_v2
  on public.jobs using btree (company_name, first_seen desc)
  where ((is_active is true) and (listing_confidence = 'active'::text));
