-- A company page's open roles in ONE round trip, with no count of the company.
--
-- `/companies/{name}/jobs` made two sequential Supabase hops — this RPC, then a
-- `job_skills` read for the page's primary skills — and every hop has a ~300ms
-- floor on this project however small (ARCHITECTURE_READ_PATH §24). Both opened
-- `slow_200:slow_read` Notices on 2026-10-03.
--
-- And the RPC itself numbered its rows with `count(*) over ()`, which reads
-- every matching row from the heap to count them: Axis Bank, 14,259 live roles,
-- took 10,480ms for a 50-row page whose own index scan is 14.8ms. An exact
-- live count cost 3,456ms on its own (14,678 heap fetches — `jobs` churns all
-- day, so its visibility map is never current).
--
-- `total_count` now comes from `company_directory`, the Tier-0 per-company live
-- count the ingest cron refreshes (exact against live on 2026-10-03). Primary
-- skills ride along per row. The caller asks for one row more than it shows, so
-- "is there a next page" never depends on the snapshot.
--
-- DROP + CREATE in one transaction: the return type gains a column. Callers on
-- the old code read the columns they name and ignore the new one.

BEGIN;

DROP FUNCTION IF EXISTS public.company_open_roles_page(text, integer, integer);

CREATE FUNCTION public.company_open_roles_page(p_company text, p_limit integer, p_offset integer)
RETURNS TABLE(
    job_id text,
    job_title text,
    location text,
    location_raw text,
    location_city text,
    location_country text,
    location_mode text,
    location_quality text,
    total_count bigint,
    primary_skills text[]
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
    with page as (
        select j.job_id, j.job_title, j.location, j.location_raw,
               j.location_city, j.location_country, j.location_mode,
               j.location_quality
        from public.jobs j
        where lower(j.company_name) = lower(btrim(p_company))
          and j.is_active
          and j.listing_confidence = 'active'
        order by j.job_id
        limit least(greatest(coalesce(p_limit, 50), 1), 101)
        offset least(greatest(coalesce(p_offset, 0), 0), 10000)
    ), total as (
        select coalesce(sum(d.active_count), 0)::bigint as n
        from public.company_directory d
        where d.sort_key = lower(btrim(p_company))
    )
    select p.job_id, p.job_title, p.location, p.location_raw,
           p.location_city, p.location_country, p.location_mode,
           p.location_quality, t.n,
           coalesce(skills.names, '{}'::text[])
    from page p
    cross join total t
    left join lateral (
        select array_agg(ranked.display_name order by ranked.rn) as names
        from (
            select s.display_name,
                   row_number() over (
                       order by js.required_level desc nulls last, s.display_name
                   ) as rn
            from public.job_skills js
            join public.skills s on s.id = js.skill_id
            where js.job_id = p.job_id
              and js.is_primary
              and btrim(coalesce(s.display_name, '')) <> ''
        ) ranked
        where ranked.rn <= 5
    ) skills on true
    order by p.job_id;
$function$;

REVOKE ALL ON FUNCTION public.company_open_roles_page(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_open_roles_page(text, integer, integer)
    TO anon, authenticated, service_role;

COMMIT;
