-- 2026-08-05 · dead-listing report, slice 2
--
-- The intent gate cached on `last_verification_attempt_at`, which is stamped on
-- every attempt including the ones that never reached a verdict. A listing the
-- verifier could not read therefore renewed its OLD confidence every 6h, for as
-- long as the failures kept coming. Five consecutive `blocked` checks on job
-- 509906 kept it reading `active` while it had not been seen live since June 21.
--
-- Freshness now keys off the last CONCLUSIVE verification, and failures to
-- reach a listing are counted so a run of them can degrade the stale claim.
-- Both are additive with safe defaults: existing rows read as "never
-- conclusively verified", so they re-verify on next intent rather than serving
-- a cached verdict.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS last_conclusive_verification_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consecutive_verify_failures SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.jobs.last_conclusive_verification_at IS
  'Last verification that reached a verdict (seen_live/closed/redirected/wrong_role). Drives the intent-gate freshness window; NULL and stale values force a re-check. Never set by blocked/timeout/unreadable results.';

COMMENT ON COLUMN public.jobs.consecutive_verify_failures IS
  'Consecutive verifier runs that could not reach the listing (blocked/timeout). Reset to 0 by any conclusive verdict. At 2 a stored `active` degrades to `uncertain` — we stop claiming verified, without claiming dead.';

-- Backfill the conclusive stamp for rows whose last observation DID conclude,
-- so a corpus that is already well-verified does not stampede the verifier on
-- deploy. Only seen_live carries a trustworthy timestamp on the jobs row today.
UPDATE public.jobs
   SET last_conclusive_verification_at = last_verified_live_at
 WHERE last_verified_live_at IS NOT NULL
   AND listing_confidence = 'active'
   AND last_conclusive_verification_at IS NULL;
