-- "New roles" means roles the student can actually browse: active and trusted.
-- The former token-client count got this from jobs RLS implicitly. The newer
-- service-role RPC bypassed that policy and therefore needs the trust predicate
-- explicitly so every caller receives the same product truth.

create index if not exists idx_jobs_trusted_ingested_at
  on public.jobs (ingested_at desc)
  where is_active is true
    and listing_confidence = 'active';

create or replace function public.count_new_jobs_for_user(p_user_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  with marker as (
    select coalesce(
      p.last_match_run_at,
      (
        select max(m.computed_at)
        from public.user_job_matches m
        where m.user_id = p_user_id
      )
    ) as ran_at
    from public.user_profiles p
    where p.id = p_user_id
  )
  select coalesce((
    select count(*)
    from public.jobs j
    cross join marker m
    where m.ran_at is not null
      and j.is_active is true
      and j.listing_confidence = 'active'
      and j.ingested_at > m.ran_at
  ), 0)::bigint;
$$;

revoke all on function public.count_new_jobs_for_user(uuid)
  from public, anon, authenticated;
grant execute on function public.count_new_jobs_for_user(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
