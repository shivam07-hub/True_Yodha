-- Retire the intern-beta cohort feedback (Shivam, 2026-09-30).
-- The 113 cohort reports were tagged by loop step on 2026-09-30; the ones that
-- touch the CV machine became the authed QA checklist in BACKLOG.md, the rest
-- were archived. The full text survives in git at
-- docs/beta-testing/closure-ledger/beta-feedback-closure-ledger.jsonl.
-- The feedback button keeps writing to user_feedback; only the cohort rows go.
-- Destructive: approved by Shivam in the 2026-09-30 grill.

DROP INDEX IF EXISTS public.idx_user_feedback_intern_beta_assignment_v1_user;

DELETE FROM public.user_feedback
WHERE payload->>'program' = 'intern_beta_assignment_v1';

NOTIFY pgrst, 'reload schema';
