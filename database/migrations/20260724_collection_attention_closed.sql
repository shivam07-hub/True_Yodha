-- Widen collection_attention_level to accept a terminal 'closed' value.
--
-- The Collections lifecycle: when a saved role's listing verifies closed
-- (job_listing_verifier), the sweep in collection_attention.py now marks the
-- application's attention level 'closed' (instead of just silently clearing
-- its notification forever) — this is the idempotency guard for the one-time
-- auto-follow-the-company side effect, and lets Collections group dead
-- listings into their own "Closed" chip instead of leaving them full-weight
-- in You-added/Applied forever.
--
-- Additive, safe: existing review/decide/urgent rows are untouched.

ALTER TABLE job_applications
  DROP CONSTRAINT IF EXISTS job_applications_collection_attention_level_check;

ALTER TABLE job_applications
  ADD CONSTRAINT job_applications_collection_attention_level_check
  CHECK (collection_attention_level IS NULL OR collection_attention_level IN ('review', 'decide', 'urgent', 'closed'));
