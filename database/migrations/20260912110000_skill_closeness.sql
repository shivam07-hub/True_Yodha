-- Skill Closeness: two skills are close when real jobs ask for them together.
--
-- The platform's only notion of "close" was the Lightcast L2 cluster — a grouping
-- of skills by what they ARE. Jobs group skills by what work needs TOGETHER, and
-- the two disagree almost completely. MEASURED on prod 2026-09-12 over 44,819
-- live jobs and the 2,114 skills appearing in 20 or more of them:
--
--   pairs jobs ask for together, vs chance          17.3x likelier
--   share of within-job pairs that are strong bonds 47.8%  (strong pairs are only
--                                                           0.69% of possible pairs)
--   strong bonds that stay inside one L2 cluster    6.0%   -> 9.4% after cleaning
--   a user's own skill pairs that are strong bonds  10.9%  (~16x chance)
--
-- PostgreSQL (filed under Databases) sits next to Spring Boot, CI/CD and
-- Microservices. Python (Scripting Languages) sits next to Keras, Django, Flask,
-- NumPy and Pandas — five different L2 clusters. A backend role is Python +
-- PostgreSQL + CI/CD, so filing it under one cluster tears it apart. That is the
-- fragmentation ADR-0022 stopped storing, and this is the relation that replaces it.
--
-- COUNTED PER COMPANY, or one employer's template becomes a fact. 67.4% of the raw
-- strong pairs came from a single employer or fewer than three: Kotak is 18% of the
-- corpus and repeats the same skill list across thousands of branch postings. A bond
-- is kept only when at least three companies show it and no single company supplies
-- more than half of its jobs. That correction removes two thirds of the pairs and
-- the cross-cluster finding survives it — 90.6% of what remains still crosses L2.
--
-- WHAT THIS IS NOT. It is not a clustering. Grouping skills into "kinds of work" was
-- tried and failed the same way grouping jobs did: the skills holding the graph
-- together are Python, SQL, Java and Git, which belong to backend, data and ML at
-- once, so the largest group swallowed 46% of every skill. Closeness is stored as a
-- pairwise relation and nothing is partitioned.
--
-- 7,028 rows, ~28.6s to build. Its own Tier-0 task on the existing lease.

create table if not exists public.skill_closeness (
  skill_id       integer not null,
  close_skill_id integer not null,
  lift           real    not null,
  jobs           integer not null,
  companies      integer not null,
  primary key (skill_id, close_skill_id)
);

create index if not exists idx_skill_closeness_skill
  on public.skill_closeness (skill_id) include (close_skill_id, lift, jobs);

comment on table public.skill_closeness is
  'Tier-0 snapshot: the skills each skill is asked for alongside, in live jobs, '
  'counted across companies so one employer''s template cannot invent a bond. '
  'Top 20 per skill by lift. A pairwise relation, never a clustering — see '
  'ADR-0022 and migration 20260912110000.';

alter table public.skill_closeness enable row level security;
drop policy if exists "skill closeness is public" on public.skill_closeness;
create policy "skill closeness is public" on public.skill_closeness for select using (true);

create or replace function public.refresh_skill_closeness()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  delete from public.skill_closeness;

  with live as (
    select job_id, company_name from public.jobs
    where is_active is true and listing_confidence = 'active'
  ), j as (
    select js.job_id, js.skill_id, l.company_name
    from public.job_skills js join live l on l.job_id = js.job_id
  ), df as (
    -- Below 20 jobs a "bond" is noise: lift explodes on rare skills.
    select skill_id, count(*) df from j group by skill_id having count(*) >= 20
  ), jf as (
    select j.job_id, j.skill_id, j.company_name from j join df on df.skill_id = j.skill_id
  ), pc as (
    select a.skill_id a, b.skill_id b, a.company_name co, count(*) c
    from jf a join jf b on a.job_id = b.job_id and a.skill_id < b.skill_id
    group by 1, 2, 3
  ), e as (
    -- Three companies minimum, and no single one supplying more than half.
    select a, b, sum(c) c, count(*) companies
    from pc group by a, b
    having sum(c) >= 10 and count(*) >= 3 and max(c)::numeric / sum(c) <= 0.5
  ), s as (
    select e.a, e.b, e.c, e.companies,
           e.c * (select count(*) from live)::numeric / (da.df * db.df) lift
    from e join df da on da.skill_id = e.a join df db on db.skill_id = e.b
  ), both_dir as (
    select a src, b dst, lift, c, companies from s where lift >= 3
    union all
    select b src, a dst, lift, c, companies from s where lift >= 3
  ), ranked as (
    select src, dst, lift, c, companies,
           row_number() over (partition by src order by lift desc, dst) rn
    from both_dir
  ), ins as (
    insert into public.skill_closeness (skill_id, close_skill_id, lift, jobs, companies)
    select src, dst, lift::real, c, companies from ranked where rn <= 20
    returning 1
  )
  select count(*)::integer into v_rows from ins;

  return jsonb_build_object('rows', v_rows, 'refreshed_at', now());
end;
$$;

revoke all on function public.refresh_skill_closeness() from public;
grant execute on function public.refresh_skill_closeness() to service_role;

-- Register on the existing lease. The CHECK lists every known task, so the row
-- cannot be inserted until it knows this one.
alter table public.snapshot_refresh_state drop constraint if exists snapshot_refresh_state_task_check;
alter table public.snapshot_refresh_state add constraint snapshot_refresh_state_task_check
  check (task = any (array['analytics','skill_demand','job_search','role_families',
                           'company_directory','ghost_index','sector_panel','skill_closeness']));

insert into public.snapshot_refresh_state (task, status, requested_by)
values ('skill_closeness', 'pending', 'migration_20260912110000')
on conflict (task) do nothing;

-- SEED BEFORE SWAP: dev and prod share one database, so the reader must never
-- observe an empty snapshot.
select public.refresh_skill_closeness();

notify pgrst, 'reload schema';
