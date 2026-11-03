-- The scraper re-sends every listing it sees on every crawl: 27 columns, the
-- 3.3 KB description among them, through a PostgREST upsert that rewrites the
-- whole row. On 2026-11-02 that was ~58k rows (1,666 POSTs, ~140 KB each), and
-- about nine in ten had not changed: enrichment, which starts only on a new
-- source_content_hash, claimed ~6.3k that day. Each rewrite stored the
-- description again, added an entry to every index on jobs, and fired three
-- triggers, one of which rewrote job_verification_schedule. That churn is most
-- of the autovacuum and checkpoint IO behind the Micro disk IO budget warning
-- (2026-11-03).
--
-- A sighting still has to land. last_seen is how the scraper's 30-day age close
-- (AGE_STALE_DAYS) knows a listing is still listed, and is_active = true is how
-- a listing reopens after a presence close. So:
--
--   new job_id         -> insert every sent column
--   content changed    -> update every sent column except first_seen
--   content unchanged  -> update only the stamps that differ (last_seen,
--                         batch_date, is_active). No trigger watches them.
--   stamps current too -> no write
--
-- One batch shares one key set, the rule the PostgREST upsert had: an omitted
-- key keeps the stored value instead of writing NULL.
--
-- Reverse: drop function public.ingest_job_observations(jsonb). The scraper's
-- PostgREST upsert path is unchanged by this file.

create or replace function public.ingest_job_observations(p_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_total integer;
  v_keys text[];
  v_unknown text[];
  v_content text[];
  v_stamps text[];
  v_insert_cols text;
  v_update_set text;
  v_changed_upsert text := 'false';
  v_changed_stamp text := 'false';
  v_inserted integer := 0;
  v_updated integer := 0;
  v_stamped integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('rows', 0, 'inserted', 0, 'updated', 0, 'stamped', 0, 'unchanged', 0);
  end if;
  v_total := jsonb_array_length(p_rows);

  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_rows -> 0) as k;

  if not ('job_id' = any (v_keys)) then
    raise exception 'ingest_job_observations: every row needs job_id';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_rows) as e
     where (select array_agg(k order by k) from jsonb_object_keys(e) as k) is distinct from v_keys
  ) then
    raise exception 'ingest_job_observations: rows in one batch must share one key set';
  end if;

  select array_agg(k) into v_unknown
    from unnest(v_keys) as k
   where not exists (
     select 1
       from pg_catalog.pg_attribute as a
      where a.attrelid = 'public.jobs'::regclass
        and a.attname = k
        and a.attnum > 0
        and not a.attisdropped
   );
  if v_unknown is not null then
    raise exception 'ingest_job_observations: not jobs columns: %', array_to_string(v_unknown, ', ');
  end if;

  v_content := array(
    select k from unnest(v_keys) as k
     where k not in ('job_id', 'first_seen', 'last_seen', 'batch_date', 'is_active')
  );
  v_stamps := array(
    select k from unnest(v_keys) as k where k in ('last_seen', 'batch_date', 'is_active')
  );

  if cardinality(v_content) > 0 then
    v_changed_upsert := format(
      '(%s) is distinct from (%s)',
      (select string_agg(format('j.%I', k), ', ') from unnest(v_content) as k),
      (select string_agg(format('excluded.%I', k), ', ') from unnest(v_content) as k)
    );
    v_changed_stamp := format(
      '(%s) is distinct from (%s)',
      (select string_agg(format('j.%I', k), ', ') from unnest(v_content) as k),
      (select string_agg(format('s.%I', k), ', ') from unnest(v_content) as k)
    );
  end if;

  v_insert_cols := (select string_agg(format('%I', k), ', ') from unnest(v_keys) as k);
  v_update_set := (
    select string_agg(format('%1$I = excluded.%1$I', k), ', ')
      from unnest(v_keys) as k
     where k not in ('job_id', 'first_seen')
  );

  execute format(
    $sql$
    with written as (
      insert into public.jobs as j (%1$s)
      select %1$s from jsonb_populate_recordset(null::public.jobs, $1)
      on conflict (job_id) do update set %2$s
      where %3$s
      returning (j.xmax = 0) as inserted
    )
    select count(*) filter (where inserted), count(*) filter (where not inserted) from written
    $sql$,
    v_insert_cols, v_update_set, v_changed_upsert
  )
  into v_inserted, v_updated
  using p_rows;

  if cardinality(v_stamps) > 0 then
    execute format(
      $sql$
      update public.jobs as j
         set %1$s
        from jsonb_populate_recordset(null::public.jobs, $1) as s
       where j.job_id = s.job_id
         and not (%2$s)
         and (%3$s) is distinct from (%4$s)
      $sql$,
      (select string_agg(format('%1$I = s.%1$I', k), ', ') from unnest(v_stamps) as k),
      v_changed_stamp,
      (select string_agg(format('j.%I', k), ', ') from unnest(v_stamps) as k),
      (select string_agg(format('s.%I', k), ', ') from unnest(v_stamps) as k)
    )
    using p_rows;
    get diagnostics v_stamped = row_count;
  end if;

  return jsonb_build_object(
    'rows', v_total,
    'inserted', v_inserted,
    'updated', v_updated,
    'stamped', v_stamped,
    'unchanged', v_total - v_inserted - v_updated - v_stamped
  );
end;
$$;

revoke all on function public.ingest_job_observations(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_job_observations(jsonb) to service_role;

notify pgrst, 'reload schema';
