-- "Verified" has to mean somebody opened it.
--
-- Two events write `jobs.last_verified_live_at` and they are not the same fact:
--
--   * the crawler, when a job_id appears in an employer's source FEED
--     (myro-job-scraper `scraper/lifecycle_writer.py` `apply_seen`), which also
--     stamps `listing_confidence = 'active'`;
--   * the verifier, when it FETCHED the apply URL and a live posting answered.
--
-- Only the verifier also writes `last_conclusive_verification_at`, so the
-- distinction was always recoverable — the readers just never made it.
-- Measured 2026-09-22: 19,258 live listings carried the crawl's stamp and
-- 18,080 of those had never been conclusively checked. 47% of the corpus wore
-- a word it had not earned, including on the public "N verified live · 7d"
-- counter and in the partner roles feed, whose own documentation told an
-- integration the field was "our own conclusive check at the employer's source,
-- which is the reason this is not a scrape".
--
-- What it costs: a shortlist built by hand for one user on 2026-08-27 was
-- opened link by link. 13 of 43 roles were already closed, and our records
-- still called 8 of those 13 active. Two of them are still marked active today.
-- Roughly three in ten unchecked listings die within a fortnight, which is why
-- `listing_trust` pairs the claim with an age and never reports one without it.
--
-- This migration carries no data change. It adds the index the honest count
-- needs, and it writes the contract onto the columns themselves so the next
-- reader does not have to rediscover it from a scraper repository they may not
-- have open.
--
-- The write side is deliberately NOT changed here. Splitting it means a new
-- `last_source_seen_at` column and a scraper release, and
-- `get_candidate_job_ids_for_roles` currently ORDERS by `last_verified_live_at`
-- — stopping the crawler's write without moving that ordering would silently
-- reshuffle which jobs reach the brain. Read seam now, write seam with the
-- retrieval work.
--
-- Additive and reversible: drop the index, reset the comments.

create index if not exists idx_jobs_conclusive_verification
  on public.jobs (last_conclusive_verification_at desc)
  where last_conclusive_verification_at is not null;

comment on column public.jobs.last_verified_live_at is
  'AMBIGUOUS — two writers. The crawler stamps it when a job_id appears in an employer''s source feed (myro-job-scraper lifecycle_writer.apply_seen), and the verifier stamps it when it fetched the apply URL. Do NOT read it as evidence a listing was opened; read last_conclusive_verification_at. Measured 2026-09-22: 19,258 live rows carried this stamp, 18,080 of them never conclusively checked.';

comment on column public.jobs.last_conclusive_verification_at is
  'A verifier fetched this apply URL and got a conclusive answer. The only column that means "we opened it". app/services/listing_trust.py is the one reader that turns it into a claim, with a 7-day freshness window — roughly three in ten unchecked listings die within a fortnight.';

notify pgrst, 'reload schema';
