-- Retire `claim_jobs_for_skill_floor`, the Stage A claim that stamped the
-- verdict (`skill_floor_attempted_at`) at claim time and stranded every job a
-- killed drain was holding. `claim_skill_floor_lease` replaced it
-- (20261003120000); no caller remains on Develop or main (PR #336), and no
-- database function references it. Recreate from 20260815150608 if ever needed.

DROP FUNCTION IF EXISTS public.claim_jobs_for_skill_floor(INTEGER);
