-- The vocabulary a direction is graded against (ADR-0022).
--
-- ADR-0022 says every fit is a graded score computed from skills, and BACKLOG #46
-- S4 measured the rule: a job fits a direction when it asks for >= 2 of that
-- direction's characteristic skills (76% precision / 40% reach, against the
-- bucket's 71% / 29%). S4 was deferred because grading all 46,801 live jobs per
-- request costs 5.8-23.2s on the shared instance. It is only expensive at corpus
-- scale: over the tens of jobs in a pick set or a triage pool, the same rule is
-- an index-only lookup.
--
-- What blocked the cheap path was the vocabulary, not the rule. Measured
-- 2026-09-16 over the 3,000 most recently seen live jobs:
--
--   job.main_skills vs role_family_labels.top_skills (8, by TF-IDF weight)
--     Business Operations   102 on-direction      Data Analysis      3
--     Sales Management       24                   Software Dev      85
--   job_skills rows vs the 12 most-DEMANDED skills (the measured rule)
--     Business Operations   780                   Data Analysis    235
--     Sales Management      260                   Software Dev     271
--   job.main_skills vs those same 12 most-demanded names
--     Business Operations   736  (94% of 780)     Sales Management 256  (98% of 260)
--
-- `top_skills` ranks by DISTINCTIVENESS (tf-idf `role_family_skill_weights.weight`)
-- and is capped at 8, so it names skills that are rare in the very jobs it should
-- be matching. The demand ranking finds 94-98% of what a full `job_skills` join
-- finds, from an array the feed and the pick reader ALREADY select. So the fit
-- costs no read at all on the hot path once the 12 names are stored here.
--
-- `top_skills` keeps its meaning and its readers (it answers "what is distinctive
-- about this direction"). `core_skills` answers "what does this direction ask for",
-- which is a different question and now has its own column rather than one array
-- being bent to serve both.
alter table public.role_family_labels
  add column if not exists core_skills text[] not null default array[]::text[];

comment on column public.role_family_labels.core_skills is
  'The 12 most-demanded skill display names for this direction, summed across seniorities. The vocabulary job-to-direction fit is graded against (>= 2 = on direction). Distinct from top_skills, which ranks by tf-idf distinctiveness.';

-- Filled from `role_family_profile`, which `refresh_role_family_labels` rebuilds
-- from the scan it already makes. Runs after it, never instead of it.
create or replace function public.refresh_direction_core_skills()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rows integer;
begin
  update public.role_family_labels snap
     set core_skills = coalesce(agg.names, array[]::text[])
    from (
      select d.family,
             (array_agg(d.display_name order by d.demand desc, d.display_name asc))[1:12] as names
        from (
          select p.family, s.display_name, sum(p.weighted_demand)::bigint as demand
            from public.role_family_profile p
            join public.skills s on s.id = p.skill_id
           where nullif(btrim(s.display_name), '') is not null
           group by p.family, s.display_name
        ) d
       group by d.family
    ) agg
   where agg.family = snap.family;
  get diagnostics v_rows = row_count;

  -- A direction whose profile has gone (no live jobs) carries no vocabulary. An
  -- empty array is "we cannot grade this", which the reader treats as unknown —
  -- never as "nothing fits".
  update public.role_family_labels
     set core_skills = array[]::text[]
   where family not in (select family from public.role_family_profile)
     and cardinality(core_skills) > 0;

  return jsonb_build_object('families', v_rows, 'refreshed_at', now());
end;
$function$;

revoke all on function public.refresh_direction_core_skills() from public;
grant execute on function public.refresh_direction_core_skills() to service_role;

select public.refresh_direction_core_skills();

notify pgrst, 'reload schema';
