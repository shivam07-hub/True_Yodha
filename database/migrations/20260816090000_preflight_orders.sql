-- Pre-flight Order — ONE targeting record, shared by the gate and the market sheet.
--
-- Why a record at all. Until now the pre-flight rendered profile columns and
-- `user_memory` strings into one prose sentence, which fused two different kinds
-- of truth: things the user said, and things Myro inferred. A memory string
-- landed mid-sentence without attribution ("You lean toward Prefers roles in
-- corporate functions"), so the user could not tell which clause came from
-- where, could not judge one, and could not fix one without rewriting all of it.
--
-- The fix is per-LINE provenance and per-LINE status. A line carries where it
-- came from and whether the user answered it, so no surface has to guess how to
-- render it, and the run can be built from `status = 'kept'` and nothing else.
-- Anything unanswered is DROPPED at run time — never inferred, never defaulted.
--
-- One row per user: the order is the user's current standing search, not a
-- history. `lines` is jsonb because a line is read and written whole, always
-- through app/services/preflight/lines.py — there is no query that filters by a
-- single line's field, so a child table would buy joins and buy nothing else.
--
-- NOT a second source of truth for the matcher. On Run the kept lines are
-- projected onto `user_profiles` + authored `preference` facts through the
-- existing single writer (app/services/preflight/payload.py → PATCH /users/me's
-- machinery), so `targeting.for_ranking` keeps reading exactly what it reads
-- today. This table holds the CONVERSATION about the targeting; the profile
-- still holds the targeting.
--
-- Additive and reversible. Manual-apply (feedback_supabase_migrations_manual)
-- then NOTIFY pgrst.

CREATE TABLE IF NOT EXISTS public.preflight_orders (
    user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    -- The user's own opening words. Sentence 1 of the brief is built from this
    -- verbatim; it is never rewritten, only re-stated.
    said         text NOT NULL DEFAULT '',
    -- OrderLine[] — see app/services/preflight/lines.py for the shape.
    lines        jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Reversible log entries, newest last. Every mutating op appends one so the
    -- market sheet's `undo` restores the previous state EXACTLY, including a
    -- line's prior kept/dropped/unanswered status.
    log          jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    last_run_at  timestamptz
);

ALTER TABLE public.preflight_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY preflight_orders_own_select ON public.preflight_orders
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY preflight_orders_own_insert ON public.preflight_orders
        FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY preflight_orders_own_update ON public.preflight_orders
        FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY preflight_orders_own_delete ON public.preflight_orders
        FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.preflight_orders IS
    'One targeting order per user, as typed lines with provenance + answer status. Read/written by the pre-flight gate AND the market sheet. Kept lines are projected onto user_profiles at Run — this is not the matcher''s source.';

NOTIFY pgrst, 'reload schema';
