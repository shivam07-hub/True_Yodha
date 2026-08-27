-- Career target snapshot + learning-path demand + skill certificates.
-- Platform standard: Career Target → Skill Path (2026-08).
-- Additive. user_profiles remains the compatibility projection.

begin;

-- Source seniority as stored on jobs.seniority_level (Firecrawl). Field aliases
-- only — never title or years inference.
create or replace function public.canonical_source_seniority(p_value text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case lower(btrim(coalesce(p_value, '')))
    when 'intern' then 'intern'
    when 'internship' then 'intern'
    when 'entry' then 'entry'
    when 'junior' then 'entry'
    when 'graduate' then 'entry'
    when 'mid' then 'mid'
    when 'senior' then 'senior'
    when 'lead' then 'lead'
    when 'executive' then 'executive'
    when 'director' then 'executive'
    when 'vp' then 'executive'
    else null
  end;
$$;

comment on function public.canonical_source_seniority(text) is
  'Normalise the Firecrawl/source seniority field to the six-band vocabulary. '
  'Does not read job titles or years.';

revoke all on function public.canonical_source_seniority(text) from public;
grant execute on function public.canonical_source_seniority(text) to service_role;

-- Modal Lightcast L1 for an L2 role family (jobs.role_family = skills.l2_cluster).
create or replace function public.l1_career_area_for_family(p_family text)
returns text
language sql
stable
set search_path to 'public'
as $$
  select s.l1_domain
  from public.skills s
  where s.l2_cluster = p_family
    and nullif(btrim(s.l1_domain), '') is not null
  group by s.l1_domain
  order by count(*) desc, s.l1_domain asc
  limit 1;
$$;

comment on function public.l1_career_area_for_family(text) is
  'Career area (taxonomy L1) for a role family, as the modal l1_domain of its L3 skills.';

revoke all on function public.l1_career_area_for_family(text) from public;
grant execute on function public.l1_career_area_for_family(text) to service_role;

-- Same family-scoped trusted-active market as role_family_market_skills, plus
-- source seniority. Not a second corpus-wide demand calculation.
create or replace function public.role_family_band_market_skills(
    p_families text[],
    p_seniority text
)
returns table(
    taxonomy_key text,
    skill_job_count integer,
    primary_job_count integer,
    has_side_skill boolean,
    band_job_count integer,
    weighted_demand integer
)
language sql
stable
set search_path to 'public'
as $$
    with selected_jobs as (
        select job_id
        from public.jobs
        where role_family = any(coalesce(p_families, array[]::text[]))
          and is_active is true
          and listing_confidence = 'active'
          and public.canonical_source_seniority(seniority_level) = p_seniority
    ), totals as (
        select count(*)::integer as job_count from selected_jobs
    )
    select skill.taxonomy_key,
           count(distinct selected.job_id)::integer as skill_job_count,
           count(distinct selected.job_id) filter (where job_skill.is_primary)::integer as primary_job_count,
           bool_or(not job_skill.is_primary) as has_side_skill,
           totals.job_count as band_job_count,
           sum(case when job_skill.is_primary then 2 else 1 end)::integer as weighted_demand
    from selected_jobs as selected
    join public.job_skills as job_skill on job_skill.job_id = selected.job_id
    join public.skills as skill on skill.id = job_skill.skill_id
    cross join totals
    group by skill.taxonomy_key, totals.job_count;
$$;

comment on function public.role_family_band_market_skills(text[], text) is
  'Family + source-seniority demand. Same trusted-active job set as '
  'role_family_market_skills, restricted to one Firecrawl seniority band.';

revoke all on function public.role_family_band_market_skills(text[], text) from public;
grant execute on function public.role_family_band_market_skills(text[], text) to service_role;

create table if not exists public.career_target_snapshots (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    role_title text not null,
    l1_career_area text,
    l2_role_family text not null,
    seniority text not null
        check (seniority in ('intern', 'entry', 'mid', 'senior', 'lead', 'executive')),
    locations text[] not null default '{}'::text[],
    cv_baseline_id integer references public.cv_versions(id) on delete set null,
    created_at timestamptz not null default now(),
    superseded_at timestamptz,
    constraint career_target_snapshots_locations_cap
        check (cardinality(locations) <= 3)
);

comment on table public.career_target_snapshots is
  'Immutable direction history. Current row is superseded_at IS NULL. '
  'user_profiles is the compatibility projection until every consumer reads this.';

create unique index if not exists career_target_snapshots_current
    on public.career_target_snapshots (user_id)
    where superseded_at is null;

create index if not exists career_target_snapshots_user_created
    on public.career_target_snapshots (user_id, created_at desc);

alter table public.career_target_snapshots enable row level security;

drop policy if exists "own career target snapshots read" on public.career_target_snapshots;
create policy "own career target snapshots read"
    on public.career_target_snapshots for select
    using (auth.uid() = user_id);

revoke all on public.career_target_snapshots from anon, authenticated;
grant select on public.career_target_snapshots to authenticated;
grant all on public.career_target_snapshots to service_role;

-- Backfill one current snapshot for users who already have a complete direction.
insert into public.career_target_snapshots (
    user_id, role_title, l1_career_area, l2_role_family, seniority,
    locations, cv_baseline_id, created_at
)
select
    p.id,
    coalesce(
        nullif(btrim(p.target_role_title), ''),
        nullif(btrim((p.target_role_titles)[1]), '')
    ),
    public.l1_career_area_for_family(nullif(btrim((p.target_roles)[1]), '')),
    nullif(btrim((p.target_roles)[1]), ''),
    p.target_seniority,
    coalesce((p.target_locations)[1:3], '{}'::text[]),
    (
        select v.id
        from public.cv_versions v
        where v.user_id = p.id and v.kind = 'baseline_upload'
        order by v.created_at desc
        limit 1
    ),
    coalesce(p.target_updated_at, now())
from public.user_profiles p
join auth.users u on u.id = p.id
where coalesce(
        nullif(btrim(p.target_role_title), ''),
        nullif(btrim((p.target_role_titles)[1]), '')
      ) is not null
  and nullif(btrim((p.target_roles)[1]), '') is not null
  and p.target_seniority in ('intern', 'entry', 'mid', 'senior', 'lead', 'executive')
on conflict do nothing;

create table if not exists public.learning_path_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    taxonomy_key text not null,
    skill_id integer references public.skills(id) on delete set null,
    target_snapshot_id uuid references public.career_target_snapshots(id) on delete set null,
    seniority text,
    created_at timestamptz not null default now(),
    withdrawn_at timestamptz,
    fulfilled_at timestamptz,
    fulfillment_notification_id bigint
);

comment on table public.learning_path_requests is
  'Idempotent owner request for a complete L1–L5 ladder. Unique while not withdrawn.';

create unique index if not exists learning_path_requests_active
    on public.learning_path_requests (user_id, taxonomy_key)
    where withdrawn_at is null;

create index if not exists learning_path_requests_pending_skill
    on public.learning_path_requests (taxonomy_key)
    where withdrawn_at is null and fulfilled_at is null;

alter table public.learning_path_requests enable row level security;

drop policy if exists "own learning path requests read" on public.learning_path_requests;
create policy "own learning path requests read"
    on public.learning_path_requests for select
    using (auth.uid() = user_id);

drop policy if exists "own learning path requests insert" on public.learning_path_requests;
create policy "own learning path requests insert"
    on public.learning_path_requests for insert
    with check (auth.uid() = user_id);

drop policy if exists "own learning path requests update" on public.learning_path_requests;
create policy "own learning path requests update"
    on public.learning_path_requests for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

revoke all on public.learning_path_requests from anon, authenticated;
grant select, insert, update on public.learning_path_requests to authenticated;
grant all on public.learning_path_requests to service_role;

create table if not exists public.skill_certificates (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    skill_id integer not null references public.skills(id),
    taxonomy_key text not null,
    skill_display_name text not null,
    achieved_level smallint not null check (achieved_level between 1 and 5),
    passed_at timestamptz not null default now(),
    attempt_id uuid not null references public.quiz_attempts(id),
    assessment_edition text not null,
    verification_id text not null,
    cv_promoted_at timestamptz,
    cv_promoted_baseline_id integer references public.cv_versions(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint skill_certificates_attempt_unique unique (attempt_id),
    constraint skill_certificates_verification_unique unique (verification_id)
);

comment on table public.skill_certificates is
  'Immutable Myro Skill Certificate issued on a passing assessment. '
  'Does not edit user_skills. cv_promoted_* is write-once after reviewed Add to CV.';

create index if not exists skill_certificates_user
    on public.skill_certificates (user_id, passed_at desc);

alter table public.skill_certificates enable row level security;

drop policy if exists "own skill certificates read" on public.skill_certificates;
create policy "own skill certificates read"
    on public.skill_certificates for select
    using (auth.uid() = user_id);

revoke all on public.skill_certificates from anon, authenticated;
grant select on public.skill_certificates to authenticated;
grant all on public.skill_certificates to service_role;

-- Public verify: skill, level, date, verification id. No email, evidence, or keys.
create or replace function public.skill_certificate_public(p_verification_id text)
returns table(
    skill_display_name text,
    achieved_level smallint,
    passed_at timestamptz,
    verification_id text,
    assessment_edition text
)
language sql
stable
security definer
set search_path to 'public'
as $$
    select c.skill_display_name, c.achieved_level, c.passed_at,
           c.verification_id, c.assessment_edition
    from public.skill_certificates c
    where c.verification_id = p_verification_id
    limit 1;
$$;

comment on function public.skill_certificate_public(text) is
  'Public certificate receipt. Omits user identity, CV evidence, and answer keys.';

revoke all on function public.skill_certificate_public(text) from public;
grant execute on function public.skill_certificate_public(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
