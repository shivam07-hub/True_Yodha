-- De-seed the verification stamps that were never earned.
--
-- WHY. `20260711_trusted_job_lifecycle.sql:27-32` set
--   last_verified_live_at = TO_DATE(last_seen::TEXT,'YYYYMMDD')
-- across the corpus. `last_seen` has NEVER updated on any row — 0 of 52,717
-- rows have ever differed from `first_seen` (measured 2026-09-27) — so that
-- statement stamped "we confirmed this listing is open" onto jobs nobody had
-- checked. 26,521 rows carry it; 24,551 of them are active. `listing_trust.py`
-- was built to stop exactly this and logged it at 47% on 2026-09-22.
--
-- WHAT THIS UNBLOCKS. `claim_verify_targets` orders NULLS FIRST over
-- oldest-unchecked. A fake stamp makes a never-checked row look recently
-- checked, so it sorts behind genuine re-checks. Nulling it puts all 26,521 at
-- the FRONT of a belt already clearing ~18,000/week: the corpus becomes
-- genuinely verified in roughly a fortnight, with no new machinery.
--
-- ⚠️ WHAT THIS DELIBERATELY DOES NOT DO: touch `listing_confidence`.
-- `is_recommendable_listing` (job_intelligence_policy.py:38) returns true ONLY
-- for `listing_confidence = 'active'`. Flipping these 18,259 rows to
-- 'uncertain' would halve the recommendable corpus in one statement —
-- 36,968 → 18,705 — while ingestion is already frozen. The verifier sets the
-- truth per row as it checks, on evidence. A migration must not guess it.
--
-- USER-VISIBLE CHANGE: none, today. `job_intelligence.py:255-257` coalesces
-- `last_verified_live_at or last_seen`, so the card renders identically until
-- that reader is fixed (ARCHITECTURE_LISTING_TIME.md step 3).
--
-- REVERSIBLE. `last_seen` is untouched, so the prior state is exactly:
--   UPDATE public.jobs SET last_verified_live_at =
--     TO_DATE(last_seen::TEXT,'YYYYMMDD')::TIMESTAMP AT TIME ZONE 'UTC'
--   WHERE last_verified_live_at IS NULL
--     AND last_seen BETWEEN 20000101 AND 29991231;
-- Do not run that. It is recorded so the undo is known, not recommended.

UPDATE public.jobs
SET    last_verified_live_at = NULL,
       confidence_reason     = 'deseeded_unearned_stamp'
WHERE  last_verified_live_at IS NOT NULL
  AND  last_seen BETWEEN 20000101 AND 29991231
  AND  last_verified_live_at::date = TO_DATE(last_seen::TEXT,'YYYYMMDD');
