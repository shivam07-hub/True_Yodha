-- cv_upload_jobs.stall_requeue_count — the budget that stops a recovery loop.
--
-- A CV upload whose worker is killed mid-job (a deploy, an OOM) is recoverable:
-- the extracted text is still in the RQ payload, so the job can simply be put
-- back on the lane and the user never learns anything went wrong. That is the
-- right default — on 2026-08-03 a deploy stranded a real signup for a quarter of
-- an hour and then refunded them, when re-running would have cost ~45 seconds.
--
-- But "re-run whatever stalled" without a bound is an infinite loop waiting for
-- a job that kills workers rather than one killed by them. This column is that
-- bound: after `_MAX_STALL_REQUEUES` attempts the recovery path gives up and the
-- job fails and refunds, exactly as it does today.
--
-- Counted here rather than in Redis because the decision is made from the status
-- read path, which already holds the job row, and because a counter that lives
-- in the same store as the job cannot disagree with it.
--
-- Additive; existing rows default to 0 (never requeued).

alter table public.cv_upload_jobs
  add column if not exists stall_requeue_count integer not null default 0;

comment on column public.cv_upload_jobs.stall_requeue_count is
  'Times this job was re-queued after its worker went silent. Bounds the stall-recovery loop; see cv_workflow._MAX_STALL_REQUEUES.';

-- Atomic increment: two pollers can observe the same stale row in the same
-- second, and a read-modify-write would let them share one slot of the budget.
create or replace function public.increment_cv_upload_stall_requeue(p_job_id uuid)
returns integer
language sql
security definer
set search_path to 'public'
as $$
    update public.cv_upload_jobs
    set    stall_requeue_count = stall_requeue_count + 1
    where  id = p_job_id
    returning stall_requeue_count;
$$;

revoke all on function public.increment_cv_upload_stall_requeue(uuid) from public;

notify pgrst, 'reload schema';
