-- Drop the source-allowlist gate. It was replaced, not deferred.
--
-- `20260726180000_learning_ladder_content_foundation.sql` built a reviewed-source
-- allowlist to gate which skill_questions could be served: a question was
-- servable when it cited a URL from a human-reviewed list.
--
-- `20260830170000_servable_gate_is_verification.sql` replaced that rule. A
-- question is servable when an independent model has re-checked its answer key
-- (`verified_at`), which is the thing that actually protects the user — the
-- 2026-08-30 sweep found 44 wrong answer keys, 7 of them live, none of which a
-- source URL would have caught.
--
-- Measured 2026-09-02, before dropping:
--   learning_source_allowlist                     0 rows
--   skill_questions.source_allowlist_id NOT NULL  0 rows
--   skill_questions.source_url NOT NULL         300 rows, 4 distinct URLs
--
-- Those 4 URLs are why the rule was worth replacing rather than filling in: two
-- are homepages (iiml.ac.in and its MBA programme page) and they back 200 of the
-- 300 questions, including a batch of regression questions on unrelated skills.
-- A citation that does not ground the question is worse than none — it looks
-- like provenance.
--
-- Neither column has a writer or a reader anywhere in the codebase (grepped
-- backend/ and frontend/ 2026-09-02): `source_url` appears only in a docstring
-- describing a source-grounded publisher that was never built, and
-- `source_allowlist_id` appears only in the migration that created it. So the
-- expand-contract order is already satisfied — there is no reading code to ship
-- first.
--
-- REVERSIBLE: the full DDL for the table, its constraints and its RLS policy is
-- in 20260726180000. Re-running that file's CREATE TABLE block restores it. No
-- data is lost, because there is none.

ALTER TABLE public.skill_questions
  DROP COLUMN IF EXISTS source_allowlist_id,
  DROP COLUMN IF EXISTS source_url;

DROP TABLE IF EXISTS public.learning_source_allowlist;

NOTIFY pgrst, 'reload schema';
