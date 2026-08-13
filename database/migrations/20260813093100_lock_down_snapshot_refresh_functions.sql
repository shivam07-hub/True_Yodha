-- The project grants function EXECUTE directly to API roles through default
-- privileges. PUBLIC-only revokes therefore do not protect internal RPCs.

revoke all on function public.request_snapshot_refresh(text, boolean)
  from public, anon, authenticated;
revoke all on function public.claim_snapshot_refresh(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.finish_snapshot_refresh(text, boolean, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.run_snapshot_sql_refresh(text, text)
  from public, anon, authenticated;

grant execute on function public.request_snapshot_refresh(text, boolean) to service_role;
grant execute on function public.claim_snapshot_refresh(text, text, integer) to service_role;
grant execute on function public.finish_snapshot_refresh(text, boolean, jsonb, text) to service_role;
grant execute on function public.run_snapshot_sql_refresh(text, text) to service_role;

notify pgrst, 'reload schema';
