-- The reader `skill_closeness` never had. S5 of BACKLOG #46.
--
-- Migration 20260912110000 built the graph — 7,287 bonds over 1,122 skills — and
-- shipped with ZERO callers. This is the one that makes it answer a question:
-- `compute_gap_skills` ranked by demand x level-gap and knew nothing about what
-- the person already holds, so "learn what is next to what you know" was written
-- down as the product and not implemented anywhere.
--
-- WHAT THE GRAPH CAN AND CANNOT SAY. Measured 2026-09-14 over 37 users with a
-- target:
--
--   candidates (whole family demand vocabulary) with a bond      4.3%
--   candidates in the top 25 — where the 5 slots are decided    15.1%
--   distinct skills users hold                                  1,294
--     ... that clear the >= 20-live-jobs bonding floor            588
--     ... that actually carry a bond                              423
--
-- So 55% of what people hold appears in fewer than 20 live jobs and is excluded
-- from bonding on purpose — below that a "bond" is lift noise on a rare pair.
-- That ceiling is real and not worth tuning away: 20260912110000 already found
-- 67.4% of raw bonds were a single employer's repeated template.
--
-- The consequence for the caller is the whole design: **closeness only ever
-- LIFTS.** A candidate with no bond keeps exactly the rank demand and gap give
-- it. Absence of a bond is not evidence of distance, and a scheme that demoted
-- the unbonded would let a silent 85% decide the list.
--
-- WHY ln(1 + lift) AND NOT lift. Lift explodes on rare pairs, so a sum of raw
-- lift is decided by one lucky edge. For a real user it put Gitlab (216.7 over
-- ONE bond) above Kubernetes (67.4 over two). Damped, the ordering becomes
-- Angular / Flask / Scala — three bonds each — which is what "close to what you
-- already have" is supposed to mean.
--
-- WHY taxonomy_key AND NOT a user id. The caller already holds these names; the
-- function takes no user id, reads nothing user-scoped, and returns a public
-- aggregate. There is nothing here to leak, so it stays SECURITY INVOKER and
-- never becomes an oracle for a parameter it was handed (READ_PATH_PLAYBOOK §4b).
--
-- COST: 6.0ms as `authenticated` on prod, 112 neighbour rows for a 15-skill
-- caller, index-only throughout (idx_skill_closeness_skill). Called inside the
-- recompute's read wave alongside the family-market read — both depend only on
-- the same inputs, so it adds no wall time. A sequential hop here is ~165ms.

create or replace function public.skill_closeness_for(
  p_taxonomy_keys text[] default array[]::text[]
)
returns table (
  taxonomy_key text,
  closeness    real,
  bonds        integer
)
language sql
stable
set search_path = ''
as $$
  with held as (
    select s.id
    from public.skills s
    where s.taxonomy_key = any(coalesce(p_taxonomy_keys, array[]::text[]))
  )
  select n.taxonomy_key,
         sum(ln(1 + sc.lift))::real as closeness,
         count(*)::integer          as bonds
  from public.skill_closeness sc
  join held h on h.id = sc.skill_id
  join public.skills n on n.id = sc.close_skill_id
  -- A skill you already hold is not somewhere to go next.
  where not exists (select 1 from held h2 where h2.id = sc.close_skill_id)
  group by n.taxonomy_key;
$$;

comment on function public.skill_closeness_for(text[]) is
  'The neighbourhood of a set of skills: what live jobs ask for ALONGSIDE them, '
  'damped by ln(1+lift) so several moderate bonds beat one rare spike. Keyed on '
  'taxonomy_key so a caller passes only skill names it already holds — there is '
  'no user id here and nothing to leak, which is why it stays SECURITY INVOKER. '
  'Reader for skill_closeness (migration 20260912110000). See 20260914100000.';

revoke all on function public.skill_closeness_for(text[]) from public;
grant execute on function public.skill_closeness_for(text[]) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
