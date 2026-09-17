-- The line the reader actually reads, written to them.
--
-- `summary` is the Career Ops evaluator's 2-3 sentence verdict, and the prompt
-- that writes it describes the reader to a third party ("This candidate: …").
-- Measured 2026-09-11 over the 30 live Agent Picks: 13 called the reader "the
-- candidate" and 7 said "you". reader_voice exists to stop exactly that and has
-- never run on this path.
--
-- So the evaluator now writes a separate field, in second person, and
-- `reader_voice.violations()` gates it before it is stored — a dirty line is
-- dropped rather than shown, and the card falls back to `summary` until the row
-- is re-rated. NULL means "not yet rated under the v2 prompt", which is every
-- existing row: verdicts are re-rated when their inputs move (the prompt version
-- rides in eval_context_hash), never backfilled.
alter table public.user_job_matches
  add column if not exists pick_reason text;

comment on column public.user_job_matches.pick_reason is
  'The one line Myro says to the reader about why this job was picked, written in second person and checked by reader_voice before it is stored. Distinct from summary, which the Career Ops evaluator writes ABOUT the candidate for internal use. NULL until the row is re-rated under the v2 prompt.';

notify pgrst, 'reload schema';
