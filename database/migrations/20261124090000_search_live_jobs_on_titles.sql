-- search_live_jobs matches role words in the job TITLE, not the whole blob.
--
-- 20261123140000 matched role words anywhere in job_search_index.search_blob
-- (title | company | city | country | role_domain). A bank job filed under
-- "Marketing" was then a "marketing manager": the Delhi window of 120 held 1
-- of Delhi's 14 live Marketing Manager titles, behind Relationship Managers.
--
-- The blob still narrows (its trigram index cannot see a title alone); a
-- per-row check then requires the words inside the title part. The title is
-- the blob less its last four segments. ' | ' reads the same reversed, so the
-- four tail segments are measured with split_part on reverse(blob): linear.
-- regexp_replace(blob, '( \| [^|]*){4}$', '') gave the same titles but
-- backtracked, ~10ms a row (Delhi 530 candidates: 5,510ms).
-- Checked on the 3,000 newest rows: 2,998 equal jobs.job_title; the 2 that do
-- not were retitled after the hourly refresh (the blob's own title is cut
-- exactly). 131 of the 3,000 titles contain '|' and cut correctly; no
-- company, city or role_domain in the sample does.
--
-- Measured on prod 2026-11-24, warm, paired against the blob-only shape:
-- software engineer + Bengaluru (5,889 candidates) 59ms -> 116ms.
-- marketing manager + Delhi: 14 of 14 titled rows (was 1).
--
-- Same signature, grants kept. Rollback: re-run 20261123140000.

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
    v_join      text := case when coalesce(p_match_all, true) then ' and ' else ' or ' end;
    v_terms     text;
    v_titles    text;
    v_row_title text;
    v_cities    text;
    v_countries text;
    v_mode      text := nullif(lower(btrim(coalesce(p_mode, ''))), '');
    v_limit     integer := greatest(1, least(coalesce(p_limit, 120), 500));
    v_sql       text;
begin
    -- format(%L) literal-quotes every word, so a query cannot inject SQL.
    select string_agg(format('s.search_blob ilike %L', '%' || t || '%'), v_join),
           string_agg(format('t.title ilike %L', '%' || t || '%'), v_join),
           string_agg(format('coalesce(j.job_title, '''') ilike %L', '%' || t || '%'), v_join)
      into v_terms, v_titles, v_row_title
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
                           cross join lateral (select reverse(s.search_blob) as r) rv
                           cross join lateral (
                               select left(s.search_blob, length(s.search_blob) - (
                                          length(split_part(rv.r, ' | ', 1))
                                        + length(split_part(rv.r, ' | ', 2))
                                        + length(split_part(rv.r, ' | ', 3))
                                        + length(split_part(rv.r, ' | ', 4)) + 12)) as title
                           ) t
                     where (%s) and (%s) and (%s) and (%s)
                     order by s.first_seen desc nulls last
                     limit %s
                   ) hit
              join public.jobs j on j.job_id = hit.job_id
             where public.listing_is_live(j)
               and (%L::text is null or j.location_mode = %L)
             order by hit.first_seen desc nulls last
             limit %s
        $f$, v_terms, coalesce(v_cities, 'true'), coalesce(v_countries, 'true'), v_titles,
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
               and (%s) and (%s) and (%s) and (%s)
             order by s.first_seen desc nulls last
             limit %s
        $f$, v_mode, v_terms, coalesce(v_cities, 'true'), coalesce(v_countries, 'true'), v_row_title,
             v_limit);
    end if;

    return query execute v_sql;
end;
$function$;

revoke all on function public.search_live_jobs(text[], text[], text[], text, boolean, integer) from public, anon, authenticated;
grant execute on function public.search_live_jobs(text[], text[], text[], text, boolean, integer) to service_role;
