-- Listing Liveness (CONTEXT.md → Listing Liveness): ONE definition of a live
-- listing in SQL. Measured 2026-10-27, the rule was spelled out in 15
-- functions, the jobs RLS read policy and 12 partial indexes, and one copy
-- (refresh_sector_panel) had already dropped `is_active`.
--
-- Inlinable by construction — LANGUAGE sql, IMMUTABLE, one SELECT, no SET
-- clause, not SECURITY DEFINER, not STRICT — so the planner rewrites
-- `public.listing_is_live(j)` into the expression below before planning, and
-- the partial indexes whose predicate is this expression stay provable.
-- `search_path` is deliberately not pinned: a SET clause blocks inlining, and
-- the body names only the argument's own columns.
--
-- The partial indexes on public.jobs spell this predicate (they cannot call a
-- whole-row function). A predicate change ships with them in one migration.
--
-- Revert: drop function public.listing_is_live(public.jobs);  (after the
-- callers in 20261027121000 are reverted)

create or replace function public.listing_is_live(j public.jobs)
returns boolean
language sql
immutable
parallel safe
as $$
  select j.is_active is true and j.listing_confidence = 'active'
$$;

comment on function public.listing_is_live(public.jobs) is
  'Listing Liveness: the one SQL definition of a live listing. Inlined by the planner; '
  'keep it LANGUAGE sql, IMMUTABLE, without SET or SECURITY DEFINER. CONTEXT.md → Listing Liveness.';

grant execute on function public.listing_is_live(public.jobs) to anon, authenticated, service_role;
