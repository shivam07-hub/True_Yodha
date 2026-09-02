-- Retire the saved-role attention ladder. It was replaced by a thing that
-- already existed, not deferred.
--
-- `sweep_collection_attention` escalated every saved role review(1d) →
-- decide(3d) → urgent(7d) on AGE alone, and projected one `user_notifications`
-- row each. Age is not information: everything ages. Measured 2026-09-02:
--
--   saved rows                                   331
--   …older than 14 days                          316   (95%)
--   …sitting at `urgent`                         251   (76%)
--   collection_attention notifications           326   (78% never read)
--
-- A ladder where three quarters of the rungs are the top rung is a timestamp
-- with an exclamation mark. What it produced, across all 326 sends:
--
--   roles later tailored                           0
--   roles later applied                            0
--   roles later removed                            0
--
-- Its sibling `new_jobs` — which fires when something CHANGES rather than when
-- time passes — is read 55.6% against this one's 21.8%, on 36x fewer sends.
--
-- And the question it asked already had a better answer. `deriveNextAction`
-- (frontend/components/nav/next-action.ts) is a global, ranked, deduped "what
-- do I do now" whose rungs 4 and 5 are exactly "tailored, unsent → apply it"
-- and "saved, untailored → tailor the best one" — one answer instead of one per
-- role, rendered in the nav where the user is already looking.
--
-- `collection_snoozed_until` goes with it: snooze existed only to quiet the nag
-- (used ONCE, ever). `×` is the honest "not this one".
--
-- `collection_attention_level` is dropped too. Its terminal `closed` value was
-- an idempotency guard for the sweep, and the Collection Record reads liveness
-- straight from `jobs.listing_confidence` / `is_active` instead.
--
-- EXPAND-CONTRACT: the code that stopped reading these three columns and
-- stopped writing this notification kind ships FIRST, in the same commit as
-- this file. Apply this only after that is deployed.
--
-- REVERSIBLE for the columns (they are additive re-adds; the historical values
-- are not worth restoring — 76% of them are the single value 'urgent'). The
-- notification DELETE is NOT reversible, which is why it is separated below.

ALTER TABLE public.job_applications
  DROP COLUMN IF EXISTS collection_snoozed_until,
  DROP COLUMN IF EXISTS collection_attention_level,
  DROP COLUMN IF EXISTS collection_last_reminded_at;

-- The 326 retired inbox rows. Marked read by the shipping commit so they cannot
-- surface; this removes them for good. Run it when you are happy the prompt is
-- not coming back — the frontend filters the kind out either way.
DELETE FROM public.user_notifications WHERE kind = 'collection_attention';

NOTIFY pgrst, 'reload schema';
