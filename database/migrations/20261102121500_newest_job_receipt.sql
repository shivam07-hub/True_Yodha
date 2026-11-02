-- The newest receipt is one fact about the corpus. Asked through the caller's
-- token it was planned under the jobs policy
--
--   (listing_confidence = 'active' AND is_active IS TRUE)
--     OR created_by_user_id = auth.uid()
--
-- and the planner cannot use an ingested_at index for that OR. The same shape
-- made count_new_jobs_for_user 8,740ms as authenticated and 18ms as the owner
-- (20260824090000). This read is the `_compute` slow trip on GET /jobs/matches,
-- and that route's read timeouts: the question is identical for every caller,
-- so a cache miss still sorts the table under RLS and can be killed at 8s.
--
-- max(ingested_at) is the end of idx_jobs_ingested_at. Definer is safe: no
-- parameter, and the result is one timestamp, not a row. A caller's own
-- unlisted job is not "when Myro last received a listing."

create index if not exists idx_jobs_ingested_at
  on public.jobs (ingested_at desc);

create or replace function public.newest_job_receipt()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(j.ingested_at) from public.jobs j;
$$;

revoke all on function public.newest_job_receipt() from public, anon;
grant execute on function public.newest_job_receipt() to authenticated, service_role;

notify pgrst, 'reload schema';
