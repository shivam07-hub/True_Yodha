-- "Can this user actually practise this skill right now?" — answered in the DB.
--
-- The gap session is about to become reachable, and decision 4 of the learning
-- grill says it must never offer a practice CTA we cannot honour. Six skills of
-- 9,721 have a servable ladder, so for almost every gap the honest answer is
-- "not yet" — and today the session links to /practice regardless, which lands
-- the user on an empty room.
--
-- Answering it needs the servable predicate applied per (skill, level) and then
-- counted. Doing that by selecting rows would page: a 15-skill gap list against
-- ~250 questions per skill is 3,750 rows against PostgREST's silent 1,000-row
-- cap, and the truncation would read as "no ladder" for whichever skills fell
-- off the end. That is the same defect shape as `top_companies_at`
-- (20260830090000) — the scope travels as the scope, the count comes back
-- counted.
--
-- The predicate mirrors `_is_servable_question` in upskilling_service.py: a
-- question is servable when it is active, not retired, and carries text, a
-- source and an explanation. **Keep the two in step.** When the learning grill's
-- decision 5 lands (drop the source_url rule, gate on a second-model check
-- instead), this function changes with it or the guard starts lying in the
-- other direction — offering practice for a ladder /practice will not serve.
--
-- Returns the highest level with a full set; 0 (or absent) means unpractisable.
--
-- Additive and reversible: one new function, one new partial index.

-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
create index concurrently if not exists idx_skill_questions_servable
    on public.skill_questions (skill_id, level)
    where status = 'active'
      and retired_at is null
      and source_url is not null
      and explanation is not null;

begin;

create or replace function public.servable_ladder_max_level(
    p_skill_ids integer[],
    p_set_size  integer default 10
)
returns table (
    skill_id  integer,
    max_level integer
)
language sql
stable
set search_path to 'public'
as $function$
    with servable as (
        select q.skill_id, q.level
        from public.skill_questions q
        where q.skill_id = any(coalesce(p_skill_ids, array[]::integer[]))
          and q.status = 'active'
          and q.retired_at is null
          and nullif(btrim(q.question_text), '') is not null
          and nullif(btrim(q.source_url), '')   is not null
          and nullif(btrim(q.explanation), '')  is not null
    ), full_levels as (
        select s.skill_id, s.level
        from servable s
        group by s.skill_id, s.level
        having count(*) >= greatest(1, coalesce(p_set_size, 10))
    )
    select f.skill_id::integer, max(f.level)::integer as max_level
    from full_levels f
    -- Levels outside 1..5 are not a rung the UI can start on.
    where f.level between 1 and 5
    group by f.skill_id;
$function$;

comment on function public.servable_ladder_max_level(integer[], integer) is
    'Highest practisable ladder level per skill, counted in the DB. Mirrors '
    '_is_servable_question in upskilling_service.py — change both together.';

commit;

notify pgrst, 'reload schema';
