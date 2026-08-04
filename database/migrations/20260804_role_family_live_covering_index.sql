-- Onboarding direction step: stop reading 6,911 wide heap pages to answer
-- "which role families are hiring".
--
-- Measured on prod 2026-08-04: `list_role_families(...)` — the ONLY thing the
-- direction step waits on — ran 9.67s. `EXPLAIN (ANALYZE)` named two causes,
-- both the same shape:
--
--   1. `live_jobs` (role_family NOT NULL ∧ is_active ∧ listing_confidence='active')
--      resolved through a BitmapAnd of three separate indexes and then read
--      `Heap Blocks: exact=6911` to fetch 10,838 rows. `jobs` is a wide table
--      (job_description), so ~1 live row per page — cold, that scan alone is 3.2s;
--      warm it is 40ms, which is why this looked intermittent rather than broken.
--   2. `family_matches` then nested-loop probed `jobs_pkey` once per matching
--      job_skills row: `loops=9700` at 0.783ms each ≈ 5.0s, because every probe
--      was another random page of the same wide table.
--
-- One partial covering index answers both: the live set becomes an index-only
-- scan over ~10.8k narrow entries, and the pkey probe is replaced by a hash join
-- against that. `job_title` is INCLUDEd because the family LABEL is the most
-- common cleaned title in the family — the one other column the function reads.
--
-- Partial on the live predicate deliberately: it keeps the index at the size of
-- the live corpus (~10.8k) rather than the whole table (~65k with a role_family),
-- and `idx_jobs_verify_due` already establishes partial+INCLUDE on this table.
--
-- Additive and reversible: DROP INDEX restores the previous plan exactly.

CREATE INDEX IF NOT EXISTS idx_jobs_live_role_family
    ON public.jobs (role_family, job_id)
    INCLUDE (job_title)
    WHERE is_active IS TRUE
      AND listing_confidence = 'active'
      AND role_family IS NOT NULL;

COMMENT ON INDEX public.idx_jobs_live_role_family IS
    'Covers the live-corpus role-family read (list_role_families / '
    'list_role_family_locations). Keep the partial predicate in lockstep with '
    'those functions'' live_jobs CTE — a predicate mismatch silently drops the '
    'index and returns the 9.7s heap scan.';
