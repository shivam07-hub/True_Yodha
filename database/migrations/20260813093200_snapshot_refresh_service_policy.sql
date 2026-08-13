-- Keep the admin-only refresh queue explicit to both Postgres and the database
-- advisor. API roles have neither table grants nor a policy.

do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'snapshot_refresh_state'
       and policyname = 'snapshot_refresh_service_role'
  ) then
    create policy snapshot_refresh_service_role
      on public.snapshot_refresh_state
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;

notify pgrst, 'reload schema';
