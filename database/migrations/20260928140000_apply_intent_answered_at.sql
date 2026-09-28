-- An Apply click is a question Myro owes the person ("did you submit?"), and
-- until now nothing recorded the answer. `Not yet` only cleared the local
-- cache, so the same question came back on every load — 29 clicks, 1 answer,
-- and the founder, who saw it, moved past it (2026-09-28). A question that
-- never stops is one people learn to ignore.
--
-- `answered_at` is set on every click row for (user, job) when the person
-- answers in any way: Yes (the application moves past saved), Not yet, or
-- Couldn't apply. The pending read asks only about unanswered clicks from the
-- last 30 days.
--
-- The person may set `answered_at` on their own rows and nothing else: a
-- column grant, not a table grant, so an UPDATE cannot rewrite what they
-- clicked or when.
--
-- Additive and reversible:
--   drop policy if exists job_apply_intents_own_answer on public.job_apply_intents;
--   drop index if exists public.job_apply_intents_pending_idx;
--   alter table public.job_apply_intents drop column if exists answered_at;

alter table public.job_apply_intents
  add column if not exists answered_at timestamptz;

create index if not exists job_apply_intents_pending_idx
  on public.job_apply_intents (user_id, clicked_at desc)
  where answered_at is null;

drop policy if exists job_apply_intents_own_answer on public.job_apply_intents;
create policy job_apply_intents_own_answer on public.job_apply_intents
  for update
  using (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  )
  with check (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false
  );

revoke update on public.job_apply_intents from authenticated, anon;
grant update (answered_at) on public.job_apply_intents to authenticated;

comment on column public.job_apply_intents.answered_at is
  'When the person answered "did you submit?" for this job (Yes, Not yet, or Couldn''t apply). NULL = still owed; the pending read asks about unanswered clicks from the last 30 days.';

notify pgrst, 'reload schema';
