-- new inventory count: 8,740ms → 18ms, by running it as the role it was written for.
--
-- MEASURED on prod 2026-08-24, same query, same user (marker 2026-04-23, 33,777
-- rows to count):
--
--   service_role     Index Only Scan on idx_jobs_trusted_ingested_at      18 ms
--   authenticated    BitmapOr → Bitmap Heap Scan, 11,362 heap blocks   8,740 ms
--
-- That 8.7s is the `new_inventory: count failed ... The read operation timed
-- out` in the 2026-08-21 logs, and it is the whole of `/home/bootstrap` at
-- 8,053-8,889ms and `/jobs/matches` at 8,086ms — both fan-outs whose slowest
-- section was always `new_jobs_count`.
--
-- WHY the plan collapses under RLS. The policy on public.jobs is:
--
--   ((listing_confidence = 'active' AND is_active IS TRUE)
--     OR created_by_user_id = auth.uid())
--
-- `idx_jobs_trusted_ingested_at` is PARTIAL on the first branch, so the planner
-- cannot use it to satisfy an OR whose second branch can match rows outside
-- that predicate. It falls back to a BitmapOr over idx_jobs_listing_confidence
-- (33,999 rows) and rechecks each one from the heap — and `ingested_at` is not
-- in that index, so every candidate is a heap fetch.
--
-- WHY definer is safe here, and not a widening. The function's own WHERE clause
-- IS the policy's public branch, so RLS adds nothing to the result:
--
--   ((trusted-active) OR (mine)) AND (trusted-active AND ingested_at > marker)
--     ≡  trusted-active AND ingested_at > marker
--
-- The rows RLS would additionally expose — a user's own non-trusted jobs — are
-- excluded by the function's predicate either way, and are not "new inventory"
-- in the first place: that means roles that LANDED, not roles you added. Same
-- rows, same count, different plan. 20260813114500 already said the RPC "needs
-- the trust predicate explicitly" because it bypasses the policy; it stated
-- definer semantics and never marked the function definer.
--
-- A definer function must not become an oracle, so the caller guard is new:
-- without it, any authenticated user could binary-search another user's
-- `last_match_run_at` through the count. service_role has no auth.uid() and is
-- unrestricted (the sweep and the notification projection ask about others);
-- an end user may only ask about themselves.
--
-- Reversible: `security invoker` restores the previous behaviour exactly.

create or replace function public.count_new_jobs_for_user(p_user_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_marker timestamptz;
  v_count  bigint;
begin
  if v_caller is not null and v_caller <> p_user_id then
    raise exception 'count_new_jobs_for_user: not your user'
      using errcode = '42501';
  end if;

  -- Marker resolved FIRST, into a local. The old single-statement form left it
  -- as a correlated expression in the count's Index Cond; with a constant the
  -- planner reaches the partial index cleanly.
  select coalesce(
           p.last_match_run_at,
           (select max(m.computed_at)
              from public.user_job_matches m
             where m.user_id = p_user_id)
         )
    into v_marker
    from public.user_profiles p
   where p.id = p_user_id;

  -- No baseline → nothing is "new". The honest prompt for that user is "run
  -- your first match", not a count.
  if v_marker is null then
    return 0;
  end if;

  select count(*)
    into v_count
    from public.jobs j
   where j.is_active is true
     and j.listing_confidence = 'active'
     and j.ingested_at > v_marker;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.count_new_jobs_for_user(uuid)
  from public, anon;
grant execute on function public.count_new_jobs_for_user(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
