-- search_live_jobs: the landing job search and the MCP's myro_search_jobs.
--
-- `search_jobs_global` (⌘K) takes the newest N rows matching ANY search word
-- and leaves place and liveness to the caller. `public_job_query` filtered the
-- city in Python AFTER that window, so "data analyst" + Mumbai read the 400
-- newest national matches of "data" OR "analyst" — four days of rows, eight
-- data analyst titles, none in Mumbai — and answered with Noida while Mumbai
-- had five live data analyst jobs. 17% of that window was closed listings.
--
-- This function puts the place, the work mode and liveness AHEAD of the window:
--   * p_match_all: every role word must appear (the caller retries with any
--     word when the role is spelled nowhere whole);
--   * p_cities / p_countries: any spelling in each list, both lists must hold;
--     matched on the same blob, which carries location_city and
--     location_country (not `locations[]` — 698 multi-city live rows match on
--     their first city only, 7 with no city match on none);
--   * only live rows: `public.listing_is_live(j)`, which inlines to the
--     spelling `idx_jobs_live_jobid_city` proves (ARCHITECTURE_READ_PATH.md §31).
-- Two shapes, chosen by how rare the work mode is:
--   * no mode, or 'onsite' (62,581 of 62,941 live rows): the window is taken
--     from the index first (twice p_limit, since ~1 in 3 matched rows is
--     closed); the live and mode checks run on that window only.
--   * any other mode ('remote' 147, 'hybrid' 13, 'unknown' 200): the mode is
--     not in the blob, so the plan starts from idx_jobs_location_mode and
--     reads the blob by job_id. Plain equality on purpose: wrapping the
--     column in lower(btrim()) hid the index and the row estimate and
--     measured 19,282ms for engineer + remote; plain equality 148ms.
--
-- Measured on prod 2026-11-23, warm, p_limit 120 (the caller keeps 60):
-- data AND analyst AND mumbai 10ms (56 rows); software AND engineer AND
-- bengaluru|bangalore 83ms (5,875 matches; 1,449ms at p_limit 400, the cost
-- is fetching full jobs rows). OR-then-filter-in-SQL measured 7,269ms.
--
-- Additive. Rollback: drop function public.search_live_jobs(text[], text[], text[], text, boolean, integer);

create or replace function public.search_live_jobs(
    p_terms       text[],
    p_cities      text[]  default null,
    p_countries   text[]  default null,
    p_mode        text    default null,
    p_match_all   boolean default true,
    p_limit       integer default 120
)
returns table(
    job_id           text,
    job_title        text,
    company_name     text,
    location_city    text,
    location_country text,
    location_mode    text,
    role_domain      text,
    first_seen       integer,
    locations        text[]
)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
    v_terms     text;
    v_cities    text;
    v_countries text;
    v_mode      text := nullif(lower(btrim(coalesce(p_mode, ''))), '');
    v_limit     integer := greatest(1, least(coalesce(p_limit, 120), 500));
    v_sql       text;
begin
    -- format(%L) literal-quotes every word, so a query cannot inject SQL.
    select string_agg(format('s.search_blob ilike %L', '%' || t || '%'),
                      case when coalesce(p_match_all, true) then ' and ' else ' or ' end)
      into v_terms
      from unnest(coalesce(p_terms, array[]::text[])) as t
     where t is not null and length(btrim(t)) > 0;

    if v_terms is null then
        return;
    end if;

    select string_agg(format('s.search_blob ilike %L', '%' || c || '%'), ' or ')
      into v_cities
      from unnest(coalesce(p_cities, array[]::text[])) as c
     where c is not null and length(btrim(c)) > 0;

    select string_agg(format('s.search_blob ilike %L', '%' || c || '%'), ' or ')
      into v_countries
      from unnest(coalesce(p_countries, array[]::text[])) as c
     where c is not null and length(btrim(c)) > 0;

    if v_mode is null or v_mode = 'onsite' then
        v_sql := format($f$
            select j.job_id, j.job_title, j.company_name, j.location_city,
                   j.location_country::text, j.location_mode::text, j.role_domain,
                   j.first_seen, j.locations
              from (
                    select s.job_id, s.first_seen
                      from public.job_search_index s
                     where (%s) and (%s) and (%s)
                     order by s.first_seen desc nulls last
                     limit %s
                   ) hit
              join public.jobs j on j.job_id = hit.job_id
             where public.listing_is_live(j)
               and (%L::text is null or j.location_mode = %L)
             order by hit.first_seen desc nulls last
             limit %s
        $f$, v_terms, coalesce(v_cities, 'true'), coalesce(v_countries, 'true'),
             v_limit * 2, v_mode, v_mode, v_limit);
    else
        v_sql := format($f$
            select j.job_id, j.job_title, j.company_name, j.location_city,
                   j.location_country::text, j.location_mode::text, j.role_domain,
                   j.first_seen, j.locations
              from public.jobs j
              join public.job_search_index s on s.job_id = j.job_id
             where j.location_mode = %L
               and public.listing_is_live(j)
               and (%s) and (%s) and (%s)
             order by s.first_seen desc nulls last
             limit %s
        $f$, v_mode, v_terms, coalesce(v_cities, 'true'), coalesce(v_countries, 'true'),
             v_limit);
    end if;

    return query execute v_sql;
end;
$function$;

-- Called only by the backend's service-role client. Not an anon or
-- authenticated surface: an invoker function over jobs behind the RLS OR
-- policy is the read-path trap ARCHITECTURE_READ_PATH.md §4b names.
revoke all on function public.search_live_jobs(text[], text[], text[], text, boolean, integer) from public, anon, authenticated;
grant execute on function public.search_live_jobs(text[], text[], text[], text, boolean, integer) to service_role;
