-- The /market pile admits by level, the rule the list already shows by.
--
-- `live_jobs_for_families` is the pile List Reading (ADR-0027) judges for
-- /market: freshest first, by role family and country. It never read level.
-- The list it fills does (`admission.admitted` → `stated_range_admits`), and so
-- does the Match Run pool (`candidates_for_user`). So the judge spent its
-- reads on roles the person could never be shown.
--
-- Measured 2026-11-27, real people who chose "Jobs that fit" in the last 30
-- days: 13 of the 16 who ended with fewer than five jobs worth showing had
-- set their level to intern or entry. People asking for entry-level roles were
-- judged against 111 lead, 95 mid and 61 senior roles and only 31 entry ones,
-- though 5,886 entry roles were live; entry roles cleared 3.5 for 29% of them,
-- lead roles for 2%. 10 of the 27 ended with an empty list.
--
-- The predicate is `candidates_for_user`'s, word for word (held equal to
-- `job_eligibility.stated_range_admits` by test_stated_level.py):
--   * an employer's stated minimum must be at most the top of the person's
--     span (`p_year_hi`); an unstated minimum is 0; there is no floor;
--   * when both bounds are unstated, a senior-side tag is refused only for a
--     person whose span centre (`p_centre`) is under 5.
-- Both parameters default to null, and null admits every level: a caller that
-- passes neither (the code on `main` while this ships) reads exactly as before.
--
-- The argument list changes, so the old signature is dropped in the same
-- transaction: two overloads would leave PostgREST unable to choose.
-- Reverse: restore 20261103234500's body and grants.

begin;

drop function if exists public.live_jobs_for_families(text[], text[], integer);

create or replace function public.live_jobs_for_families(
    p_families text[],
    p_countries text[] default null,
    p_limit integer default 400,
    p_year_hi numeric default null,
    p_centre numeric default null
)
returns table(job_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fam text;
  rec record;
  v_limit integer := greatest(1, least(coalesce(p_limit, 400), 1000));
  v_countries text[] := coalesce(p_countries, array[]::text[]);
  picked jsonb := '[]'::jsonb;
  found integer;
  country text;
  mode text;
begin
  if p_families is null or cardinality(p_families) = 0 then
    return;
  end if;

  foreach fam in array p_families loop
    found := 0;
    for rec in
      select j.job_id, j.last_verified_live_at, j.location_country, j.location_mode
        from public.jobs j
       where public.listing_is_live(j)
         and j.role_family = fam
         and (
           p_year_hi is null
           or (
             case
               when j.min_years_experience is null and j.max_years_experience is null then
                 not (
                   lower(btrim(coalesce(j.seniority_level, ''))) = any(
                     array['senior','lead','principal','staff','executive','director']
                   )
                   and coalesce(p_centre, 20) < 5
                 )
               else coalesce(j.min_years_experience, 0)::numeric <= p_year_hi
             end
           )
         )
       order by j.last_verified_live_at desc
    loop
      country := lower(btrim(coalesce(rec.location_country, '')));
      mode := lower(btrim(coalesce(rec.location_mode, '')));
      if cardinality(v_countries) = 0
         or country = any(v_countries)
         or (country = '' and mode in ('remote', 'hybrid'))
      then
        picked := picked || jsonb_build_array(jsonb_build_object(
          'id', rec.job_id,
          'at', rec.last_verified_live_at
        ));
        found := found + 1;
        exit when found >= v_limit;
      end if;
    end loop;
  end loop;

  return query
  select item->>'id'
    from jsonb_array_elements(picked) item
   order by item->>'at' desc nulls last
   limit v_limit;
end;
$$;

revoke all on function public.live_jobs_for_families(text[], text[], integer, numeric, numeric) from public, anon;
grant execute on function public.live_jobs_for_families(text[], text[], integer, numeric, numeric) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
