-- 20260912 — a banked gap answer is an INFLOW, and the ledger could not see it.
--
-- `cv_dump_entries.kind` was carrying two meanings at once: "what shape is this
-- text" and "should the extractor read this". POST /cv/jd-coverage/answer and
-- POST /cv/weave/answer write kind='note' and DO enqueue a story_ingest, while
-- the inflow ledger reads `kind IN ('file','linkedin')`. Consequences, both
-- live on prod since 2026-07-14:
--
--   * `pending_entries` (the retry_stale_ingests heal) could never see a failed
--     gap answer. Three of user 33b66361's have sat pending for two months; the
--     heal ran over them on every Stories visit and matched nothing.
--   * `ingest_status` reported pending=0, so the one surface built to show
--     pending inflow work showed none.
--
-- `answer` splits the two meanings apart: note = the user's words, not an
-- inflow; file | linkedin | answer = the extractor reads it. Widening only —
-- the backfill moves rows the code already treated as inflows.

BEGIN;

-- 1. Backfill before the constraint, so no existing row can violate it.
UPDATE public.cv_dump_entries
   SET kind = 'answer'
 WHERE source = 'jd_gap_answer'
   AND kind = 'note';

-- 2. The taxonomy becomes enforceable instead of a comment.
ALTER TABLE public.cv_dump_entries
    DROP CONSTRAINT IF EXISTS cv_dump_entries_kind_check;

ALTER TABLE public.cv_dump_entries
    ADD CONSTRAINT cv_dump_entries_kind_check
    CHECK (kind IN ('note', 'file', 'linkedin', 'answer'));

-- 3. The cross-user sweep (reservoir_ingest_sweep) scans pending inflows by age
--    on a schedule, for every user at once. Partial on the pending predicate so
--    the index holds only the work set, never the processed history.
CREATE INDEX IF NOT EXISTS idx_cv_dump_entries_pending_inflow
    ON public.cv_dump_entries (created_at)
    WHERE processed_at IS NULL;

COMMENT ON COLUMN public.cv_dump_entries.kind IS
    'Payload shape AND inflow intent: note = the user''s words, never extracted; '
    'file | linkedin | answer = the story extractor reads it. text always holds '
    'the readable content.';

COMMIT;

NOTIFY pgrst, 'reload schema';
