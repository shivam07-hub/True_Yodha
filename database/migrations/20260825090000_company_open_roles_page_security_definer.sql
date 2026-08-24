-- company_open_roles_page: 6,208ms → 152ms, by running it as the role it was
-- written for. Same fix as 20260824090000, same trap, different function.
--
-- MEASURED on prod 2026-08-25, company 'Freshworks', 50-row page:
--
--   service_role     152 ms   /  1,337 buffers
--   anon           3,673 ms   / 13,068 buffers
--   authenticated  6,208 ms   / 13,070 buffers
--
-- 13,070 buffers is the WHOLE of the jobs heap (100MB ≈ 12,800 blocks) for a
-- 50-row page. shared_buffers is 224MB, so one call sweeps 45% of the cache —
-- which is why unrelated routes finish at the same wall time in the 20 and 24
-- August saturation windows (ARCHITECTURE_READ_PATH.md §16).
--
-- WHY the plan collapses under RLS. The policy on public.jobs is:
--
--   ((listing_confidence = 'active' AND is_active IS TRUE)
--     OR created_by_user_id = auth.uid())
--
-- idx_jobs_lower_company_active_jobid is PARTIAL on the first branch, so the
-- planner cannot use it to satisfy an OR whose second branch can match rows
-- outside that predicate. It falls back to a BitmapOr over
-- idx_jobs_listing_confidence (34,075 rows) and rechecks every candidate from
-- the heap — 33,715 rows removed by filter to return 101.
--
-- THIS IS NOT A NEW FINDING, IT IS A CORRECTED ONE. Section 11 closed this
-- route on 2026-08-13 and the function's own docstring in
-- backend/app/repositories/jobs.py records "4.5ms over 5 buffers". That number
-- cannot be reproduced as any role the application actually uses; it was taken
-- as service_role. The docstring is corrected in the same commit as this
-- migration. A clean plan as service_role proves nothing — playbook §4b.
--
-- WHY definer is safe here, and not a widening. The function's own WHERE clause
-- IS the policy's public branch, verbatim:
--
--   function:  j.is_active AND j.listing_confidence = 'active'
--   policy:    (listing_confidence = 'active' AND is_active IS TRUE) OR mine
--
--   ((trusted-active) OR (mine)) AND (trusted-active AND lower(company)=…)
--     ≡  trusted-active AND lower(company)=…
--
-- The rows RLS would additionally expose — a user's own NON-trusted created
-- jobs — are excluded by the function's predicate either way.
--
-- PROVED, not argued. User 33b66361 owns 16 created jobs across 14 companies,
-- 7 of them trusted and 9 not. Before this migration, that owner and `anon`
-- returned byte-identical result sets for every one of those companies:
--
--   company                          rows  md5(job_ids)
--   American Express                  100  e45ac736e554f5abb5cf711dc9ac41c9
--   Google                              1  762e6cf78ed0672e189f5ac54c0b09fe
--   OpenAI                              2  184749a0c444b6e3ac10bf1961c25a19
--   Accelerate Your Hiring Process      1  700e92e9a4fba53795c226fb7ef0ce3c
--   Freshworks                        100  4aea839642e79df4d5aa542a2c06a8cf
--   Deloitte                            0  (null)
--   Swiggy                              0  (null)
--
-- The owner branch contributes nothing here. Re-run the same probe after
-- applying; the signatures must not move.
--
-- NO CALLER GUARD, deliberately. §4b requires one because a definer function
-- can become an oracle for whatever it takes as a parameter. This one takes a
-- company name and a page window, and returns rows already served on a public
-- unauthenticated page to `anon`. There is no per-user parameter and nothing
-- private to leak, so a guard would add a failure mode and protect nothing.
-- That is what makes this the cheapest fix on the §15 ledger.
--
-- search_path is '' with every reference schema-qualified, so a temp object
-- cannot shadow public.jobs inside a definer context.
--
-- Reversible: `security invoker` restores the previous behaviour exactly.

create or replace function public.company_open_roles_page(
  p_company text,
  p_limit   integer,
  p_offset  integer
)
returns table (
  job_id            text,
  job_title         text,
  location          text,
  location_raw      text,
  location_city     text,
  location_country  text,
  location_mode     text,
  location_quality  text,
  total_count       bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select j.job_id, j.job_title, j.location, j.location_raw,
         j.location_city, j.location_country, j.location_mode,
         j.location_quality, count(*) over () as total_count
  from public.jobs j
  where lower(j.company_name) = lower(btrim(p_company))
    and j.is_active
    and j.listing_confidence = 'active'
  order by j.job_id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset least(greatest(coalesce(p_offset, 0), 0), 10000);
$$;

comment on function public.company_open_roles_page(text, integer, integer) is
  'Public company job page. SECURITY DEFINER because its WHERE clause IS the '
  'jobs RLS public branch, so the result set is identical and only the plan '
  'changes (6,208ms authed -> 152ms). No caller guard: no per-user parameter, '
  'and the rows are already public to anon. See migration 20260825090000.';

revoke all on function public.company_open_roles_page(text, integer, integer) from public;
grant execute on function public.company_open_roles_page(text, integer, integer)
  to anon, authenticated, service_role;
