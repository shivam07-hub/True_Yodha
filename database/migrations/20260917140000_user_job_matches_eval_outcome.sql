-- Model Outcome of the brain named write. A scored verdict is still
-- overall_score; this column records a permanent refusal so Work Lane does
-- not treat malformed JSON as provider-unavailable and re-enqueue on every
-- open. unavailable is never stored — the next open may try again.
-- See CONTEXT.md Model Outcome.

alter table public.user_job_matches
  add column if not exists eval_outcome text;

alter table public.user_job_matches
  drop constraint if exists user_job_matches_eval_outcome_chk;

alter table public.user_job_matches
  add constraint user_job_matches_eval_outcome_chk
  check (
    eval_outcome is null
    or eval_outcome in ('ok', 'malformed', 'invalid_input')
  );

comment on column public.user_job_matches.eval_outcome is
  'Model Outcome of the brain write. NULL = never settled (Provisional Match '
  'or a row written before this column). ok = scored verdict. malformed / '
  'invalid_input = permanent refusal: do not retry until eval_context_hash '
  'moves. unavailable is never stored. See CONTEXT.md Model Outcome.';

notify pgrst, 'reload schema';
