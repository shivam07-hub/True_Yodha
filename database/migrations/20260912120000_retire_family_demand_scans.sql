-- Retire the three live family-demand scans the Family Profile subsumed.
--
-- All three rebuilt, per request, an aggregate the ingest refresh already holds.
-- `role_family_demand` answers every one of them from `role_family_profile`
-- (migration 20260912100000):
--
--   role_family_market_skills(text[])              4,311ms  ->  69ms  warm
--   role_family_band_market_skills(text[], text)   2,833ms  ->   9ms  (x3 per
--                                                                     Career Path load)
--   role_family_aspiration_skills(text[])          superseded by 20260803b and
--                                                  never called since
--
-- Verified before dropping: no Python or TypeScript call site remains (the only
-- textual hits are the two mentions in `family_demand_rows`' docstring recording
-- what it replaced), and no other database function references them.
--
-- Destructive, and approved: these were named to Shivam with their measured
-- timings and zero-caller status before the drop.
--
-- Reversible: each body is in its origin migration — role_family_aspiration_skills
-- in 20260731_job_role_family.sql, role_family_market_skills in
-- 20260803b_role_family_market_skills.sql.

drop function if exists public.role_family_market_skills(text[]);
drop function if exists public.role_family_band_market_skills(text[], text);
drop function if exists public.role_family_aspiration_skills(text[]);

notify pgrst, 'reload schema';
