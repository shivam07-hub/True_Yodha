-- The repo catches up with the database.
--
-- `ea372002` (2026-08-13) started reading and writing
-- `user_job_matches.eval_context_hash` and its message says the column was
-- applied — but no migration file was committed, so the repo's DDL has not
-- described this column for six weeks. `test_notice_close_match_eval_columns`
-- found it while proving the read that 500'd on 2026-09-17/18 for the same
-- reason (a column the code named before the database had it).
--
-- No-op on production, where the column exists as `text`. Additive.
-- Reverse: nothing to reverse on production; elsewhere drop the column.

alter table public.user_job_matches
    add column if not exists eval_context_hash text;
