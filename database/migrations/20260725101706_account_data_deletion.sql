-- Self-service account erasure.
--
-- App tables intentionally reference public.user_profiles rather than
-- auth.users, so deleting an Auth user alone cannot erase product data.
-- This function deletes every current public UUID user_id ownership row,
-- anonymizes authorship references on shared records, then removes the profile.
-- Dynamic discovery also covers future user-owned tables that follow the
-- canonical user_id UUID convention.

create or replace function public.delete_my_account_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  owned_table record;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Shared records remain useful after an account is erased, but the author
  -- or referral identity must not remain attached.
  update public.user_profiles
  set referred_by_user_id = null
  where referred_by_user_id = v_user_id;

  update public.jobs
  set created_by_user_id = null
  where created_by_user_id = v_user_id;

  update public.growth_campaigns
  set created_by = case when created_by = v_user_id then null else created_by end,
      updated_by = case when updated_by = v_user_id then null else updated_by end
  where created_by = v_user_id or updated_by = v_user_id;

  update public.growth_content_assets
  set owner_id = case when owner_id = v_user_id then null else owner_id end,
      created_by = case when created_by = v_user_id then null else created_by end,
      updated_by = case when updated_by = v_user_id then null else updated_by end
  where owner_id = v_user_id
     or created_by = v_user_id
     or updated_by = v_user_id;

  update public.growth_messages
  set created_by = case when created_by = v_user_id then null else created_by end,
      updated_by = case when updated_by = v_user_id then null else updated_by end
  where created_by = v_user_id or updated_by = v_user_id;

  update public.growth_publications
  set created_by = null
  where created_by = v_user_id;

  -- Delete explicit ownership rows before user_profiles so nullable or missing
  -- historical foreign keys cannot leave personal content orphaned.
  for owned_table in
    select c.relname as table_name
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_type t on t.oid = a.atttypid
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attname = 'user_id'
      and not a.attisdropped
      and t.typname = 'uuid'
      and c.relname <> 'user_profiles'
    order by c.relname
  loop
    execute format(
      'delete from public.%I where user_id = $1',
      owned_table.table_name
    ) using v_user_id;
  end loop;

  delete from public.user_profiles where id = v_user_id;
end;
$$;

revoke all on function public.delete_my_account_data() from public;
revoke all on function public.delete_my_account_data() from anon;
grant execute on function public.delete_my_account_data() to authenticated;
