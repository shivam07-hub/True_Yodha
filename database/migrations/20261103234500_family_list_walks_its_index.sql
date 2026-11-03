-- live_jobs_for_families took 5.8–7.1s for Banking Services. The plan walked
-- idx_jobs_listing_confidence and threw away 15,606 rows, because
-- `role_family = any(array)` does not match idx_jobs_live_family_verified,
-- and `ORDER BY last_verified_live_at DESC NULLS LAST` does not match that
-- index either (its default is NULLS FIRST). Equality plus DESC, with the
-- country check after each index row, stops at the page: 400 rows in 1.6ms
-- when the predicate is written that way.
--
-- One family is one index walk. Several families are merged after each has
-- stopped. The companies-list split in 20261103001000 is unchanged.

create or replace function public.live_jobs_for_families(
    p_families text[],
    p_countries text[] default null,
    p_limit integer default 400
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
       where j.is_active is true
         and j.listing_confidence = 'active'
         and j.role_family = fam
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

notify pgrst, 'reload schema';
