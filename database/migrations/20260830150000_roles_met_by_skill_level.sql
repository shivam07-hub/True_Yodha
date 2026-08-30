-- What changed, in jobs — the sentence the practice loop never said.
--
-- Clearing a level today bumps `skill_assessed_level`, issues a certificate,
-- awards coins, and tells the user NOTHING about what it bought them. No
-- re-match, no score recompute, no "three more roles now ask no more than
-- this." That sentence is the entire reason to practise; without it the loop
-- ships its plumbing and skips its product (learning grill, Delta-4 read,
-- 2026-08-30: the quiz→certificate link rates 1-2 on its own — its value is
-- "this now counts in your match", and only if we say so).
--
-- The honest claim is narrow and worth being careful about. Clearing L2 does
-- NOT mean the user matches a role; other skills may still be missing. It means
-- their level now clears the bar THAT ROLE SET FOR THIS SKILL. The function is
-- named for that and nothing wider.
--
-- `newly_met` is the delta at this level, so the payoff is what the user just
-- earned rather than a running total they cannot attribute. `total_asking` is
-- the breadth — how much of the market cares at all — and lets the caller stay
-- silent when the answer is zero: a user who clears a rung nothing asks for
-- should see no line, never a "0".
--
-- The bar falls back to the same 4-primary / 2-secondary default the gap
-- planner uses, so the two surfaces cannot disagree about what a role wants.
--
-- Additive and reversible: one function, one partial covering index.

-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--
-- Without this the join probes `jobs` by primary key once per job_skills row —
-- 661 probes for Machine Learning, 2,644 buffers, 1,145ms for one count on a
-- path that runs while the user is looking at their score. Covering
-- location_city on the live-only partial makes it an index-only scan: 13.2ms.
create index concurrently if not exists idx_jobs_live_jobid_city
    on public.jobs (job_id)
    include (location_city)
    where is_active is true and listing_confidence = 'active';

begin;

create or replace function public.roles_met_by_skill_level(
    p_skill_id    integer,
    p_from_level  integer,
    p_to_level    integer,
    p_cities      text[] default null
)
returns table (
    newly_met     integer,
    met_total     integer,
    total_asking  integer
)
language sql
stable
set search_path to 'public'
as $function$
    with scoped as (
        select coalesce(js.required_level, case when js.is_primary then 4 else 2 end) as bar
        from public.job_skills js
        join public.jobs j on j.job_id = js.job_id
        where js.skill_id = p_skill_id
          and j.is_active is true
          and j.listing_confidence = 'active'
          -- No cities saved → the whole market, not an empty answer. An unscoped
          -- user is not a user with nothing.
          and (
            p_cities is null
            or cardinality(p_cities) = 0
            or j.location_city = any(p_cities)
          )
    )
    select
        count(*) filter (where bar <= p_to_level and bar > coalesce(p_from_level, 0))::integer,
        count(*) filter (where bar <= p_to_level)::integer,
        count(*)::integer
    from scoped;
$function$;

comment on function public.roles_met_by_skill_level(integer, integer, integer, text[]) is
    'Live roles whose bar for ONE skill the user now clears, and how many are new '
    'at this level. Not a match claim — other skills may still be missing.';

commit;

notify pgrst, 'reload schema';
