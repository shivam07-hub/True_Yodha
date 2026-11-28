-- A room's step 2 counts a level proven in practice, not only one on the CV.
--
-- `prep_user_state` (20260907) gave every room the person's levels from
-- `user_skills.matched_level` alone — what the CV shows. A pass in practice
-- writes `skill_assessed_level`, which this never read, so clearing L1 of SQL
-- inside a room left that room's SQL row at "No level yet" (seen 2026-11-28 on
-- the QA account, ARCHITECTURE_ONE_PREP.md P2). The room's band promises "what
-- you clear here carries", and the target-role room already counted practice
-- (`career_skill_path_cards` → `skill_state.level_of`).
--
-- Now both sources, and the higher wins per skill: `skill_state.level_of`, THE
-- rule (a CV level and a proven level; ties go to the CV, which does not change
-- the number). Same signature, same jsonb shape, same invoker rights:
-- `skill_assessed_level` is RLS'd "owner read" (auth.uid() = user_id), the same
-- reach `user_skills` already had here.
--
-- Reverse: re-apply the body in 20260907_rehearsal_is_user_level.sql.

begin;

create or replace function public.prep_user_state()
returns jsonb
language sql
stable
set search_path to ''
as $$
    select jsonb_build_object(
        'skills', coalesce((
            select jsonb_object_agg(held.key, held.level)
            from (
                select lower(btrim(s.taxonomy_key)) as key, max(levels.level) as level
                from (
                    select us.skill_id, us.matched_level as level
                    from public.user_skills us
                    where us.user_id = auth.uid()
                      and us.matched_level is not null
                    union all
                    select sal.skill_id, sal.assessed_level as level
                    from public.skill_assessed_level sal
                    where sal.user_id = auth.uid()
                      and sal.assessed_level is not null
                ) as levels
                join public.skills s on s.id = levels.skill_id
                where nullif(btrim(s.taxonomy_key), '') is not null
                group by 1
            ) as held
        ), '{}'::jsonb),
        'rehearsed', coalesce((
            select jsonb_agg(cs.id)
            from public.career_stories cs
            where cs.user_id = auth.uid()
              and cs.rehearsed_at is not null
        ), '[]'::jsonb)
    );
$$;

commit;

notify pgrst, 'reload schema';
