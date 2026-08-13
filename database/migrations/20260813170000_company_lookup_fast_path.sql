-- Track and bound the company-page fast path applied during the #16 closeout.
--
-- PostgREST's case-insensitive exact match compiles to ILIKE, which cannot use
-- a btree equality plan. These invoker functions keep jobs RLS authoritative
-- while making the lower(company_name) predicate explicit to the planner.

begin;

create index if not exists idx_jobs_lower_company_active_jobid
  on public.jobs (lower(company_name), job_id)
  where is_active and listing_confidence = 'active';

create index if not exists idx_jobs_lower_company_first_seen
  on public.jobs (lower(company_name), first_seen desc);

create or replace function public.company_open_roles_page(
  p_company text,
  p_limit integer,
  p_offset integer
)
returns table(
  job_id text,
  job_title text,
  location text,
  location_raw text,
  location_city text,
  location_country text,
  location_mode text,
  location_quality text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
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

create or replace function public.company_jobs_for_notes(
  p_company text,
  p_limit integer
)
returns table(job_id text, job_title text)
language sql
stable
security invoker
set search_path = public
as $$
  select j.job_id, j.job_title
  from public.jobs j
  where lower(j.company_name) = lower(btrim(p_company))
  order by j.first_seen desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke all on function public.company_open_roles_page(text, integer, integer) from public;
revoke all on function public.company_jobs_for_notes(text, integer) from public;
grant execute on function public.company_open_roles_page(text, integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.company_jobs_for_notes(text, integer)
  to anon, authenticated, service_role;

commit;
