-- Brain-dump canvas (User Memory Phase 3) — the persistent working notebook.
--
-- A durable place for the user to free-write, over time, what they've done and
-- what they want (the successor to the retired diary). Two consumers:
--   1. Phase-2 distillation reads new entries as its richest signal (the user's
--      OWN words) → durable facts in user_memory.
--   2. cv_intake turns a selected entry into JD-aligned résumé bullets (existing
--      "Add from your experience" flow).
--
-- Append-only, dated entries (a timeline the distiller reads "since watermark").
-- Own-only RLS (PV1). Manual-apply then NOTIFY pgrst.

CREATE TABLE IF NOT EXISTS public.cv_dump_entries (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    text        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cv_dump_entries_user_created
    ON public.cv_dump_entries (user_id, created_at DESC);

ALTER TABLE public.cv_dump_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY cv_dump_entries_own_select ON public.cv_dump_entries
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY cv_dump_entries_own_insert ON public.cv_dump_entries
        FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY cv_dump_entries_own_delete ON public.cv_dump_entries
        FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, DELETE ON public.cv_dump_entries TO authenticated;

COMMENT ON TABLE public.cv_dump_entries IS
    'User Memory Phase 3 — persistent brain-dump notebook (successor to the diary). Feeds Phase-2 distillation + cv_intake. Own-only RLS. PV1.';

NOTIFY pgrst, 'reload schema';
