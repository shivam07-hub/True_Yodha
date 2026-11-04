-- The feed's role list and the companies list were still their own scans.
--
-- Role list, service role, family "Banking Services", 400 rows: 2.6s. It
-- filters live jobs and then sorts by last_verified_live_at. No index has
-- both, so a larger family, or the caller's row policy, reaches the 8s cutoff.
-- The page is live jobs in those families, newest verified first.
--
-- Companies list, Bengaluru, cold: 5.2s, then 0.3s. `top_companies_at` OR'd
-- city and industry in one predicate, so the city index was not the plan.
-- A city walk and an industry walk are separate. Same rows, same order.
--
-- Internships already have idx_jobs_live_intern_first_seen. This file does
-- not replace that index.

create index if not exists idx_jobs_live_family_verified
  on public.jobs (role_family, last_verified_live_at desc)
  where is_active is true and listing_confidence = 'active';

create or replace function public.live_jobs_for_families(
    p_families text[],
    p_countries text[] default null,
    p_limit integer default 400
)
returns table(job_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select j.job_id
    from public.jobs j
   where public.listing_is_live(j)
     and j.role_family = any(p_families)
     and (
       p_countries is null
       or cardinality(p_countries) = 0
       or lower(btrim(j.location_country)) = any(p_countries)
       or (
         (j.location_country is null or btrim(j.location_country) = '')
         and lower(btrim(j.location_mode)) in ('remote', 'hybrid')
       )
     )
   order by j.last_verified_live_at desc nulls last
   limit greatest(1, least(coalesce(p_limit, 400), 1000));
$$;

revoke all on function public.live_jobs_for_families(text[], text[], integer) from public, anon;
grant execute on function public.live_jobs_for_families(text[], text[], integer) to authenticated, service_role;

create or replace function public.top_companies_at(
    p_kind  text,
    p_value text,
    p_limit integer default 8,
    p_sort  text default 'roles'
)
returns table (
    company_name     text,
    open_count       integer,
    location_country text,
    max_seen         integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 8), 20));
begin
  if p_kind = 'city' then
    return query
    with scoped as (
        select btrim(j.company_name) as company_name,
               nullif(btrim(j.location_country), '') as location_country,
               nullif(greatest(coalesce(j.last_seen, 0), coalesce(j.first_seen, 0)), 0) as seen
          from public.jobs j
         where public.listing_is_live(j)
           and j.location_city = p_value
           and nullif(btrim(j.company_name), '') is not null
    ), grouped as (
        select s.company_name,
               count(*)::integer as open_count,
               max(s.seen)::integer as max_seen,
               mode() within group (order by s.location_country) as location_country
          from scoped s
         group by s.company_name
    )
    select g.company_name, g.open_count, g.location_country, g.max_seen
      from grouped g
     order by (case when p_sort = 'last_seen' then g.max_seen end) desc nulls last,
              g.open_count desc,
              g.company_name
     limit v_limit;
    return;
  end if;

  if p_kind = 'industry' then
    return query
    with scoped as (
        select btrim(j.company_name) as company_name,
               nullif(btrim(j.location_country), '') as location_country,
               nullif(greatest(coalesce(j.last_seen, 0), coalesce(j.first_seen, 0)), 0) as seen
          from public.jobs j
         where public.listing_is_live(j)
           and j.industry_group = p_value
           and nullif(btrim(j.company_name), '') is not null
    ), grouped as (
        select s.company_name,
               count(*)::integer as open_count,
               max(s.seen)::integer as max_seen,
               mode() within group (order by s.location_country) as location_country
          from scoped s
         group by s.company_name
    )
    select g.company_name, g.open_count, g.location_country, g.max_seen
      from grouped g
     order by (case when p_sort = 'last_seen' then g.max_seen end) desc nulls last,
              g.open_count desc,
              g.company_name
     limit v_limit;
  end if;
end;
$$;

notify pgrst, 'reload schema';
