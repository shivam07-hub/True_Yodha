-- The ladder gate stops asking for a link and starts asking whether it is right.
--
-- `servable_ladder_max_level` (20260830120000) deliberately mirrored
-- `_is_servable_question`, and its own comment said: keep the two in step, or
-- the guard starts lying. Decision 5 of the learning grill moved the Python
-- gate from `source_url` to `verified_at`; this is the other half of that, in
-- the same session, so the gap session's practice CTA and what /practice will
-- actually serve cannot disagree.
--
-- Without this, every newly-verified ladder would still read "no ladder" to the
-- gap session — the guard hiding the feature it exists to protect.
--
-- What the verification pass found, running an independent judgment model over
-- all 1,545 questions for the first time: 41 had an answer key the second model
-- rejected, and **7 of those were live and being scored against users**. Their
-- levels, coins and certificates followed from answers that were wrong. Those
-- 41 are retired; nothing serves them again.
--
-- Yield: 6 complete ladders → 16. Lower than the 21 projected before the run,
-- because retiring a question can drop a level under the ten-question floor and
-- break an otherwise-complete ladder. That is the gate working.
--
-- `source_url` stays on the row and is no longer read. Real per-question
-- sourcing is a later slice; the column is where it will land.
--
-- Additive and reversible: one function body replaced, no data touched here.

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
          -- The gate. An unverified question is not servable, no matter what
          -- else it carries.
          and q.verified_at is not null
          and nullif(btrim(q.question_text), '') is not null
          and nullif(btrim(q.explanation), '')  is not null
    ), full_levels as (
        select s.skill_id, s.level
        from servable s
        group by s.skill_id, s.level
        having count(*) >= greatest(1, coalesce(p_set_size, 10))
    )
    select f.skill_id::integer, max(f.level)::integer as max_level
    from full_levels f
    where f.level between 1 and 5
    group by f.skill_id;
$function$;

comment on function public.servable_ladder_max_level(integer[], integer) is
    'Highest practisable ladder level per skill, counted in the DB. Mirrors '
    '_is_servable_question in upskilling_service.py — change both together. '
    'Gate moved from source_url to verified_at on 2026-08-30.';

commit;

notify pgrst, 'reload schema';
