-- 20260702 — private_notes (CV-intake "save my story", journey Entry 3.1/3.2)
--
-- The user's OWN private note per entity — NOT a public feed. Where `comments`
-- (20260531) is a community thread keyed by ninja_name and read by anyone,
-- private_notes is own-only end to end: no public read repo, no ninja_name join,
-- no `status`/flagging. One living note per (user, entity_type, entity_id) via a
-- UNIQUE — the backend upserts, so re-saving edits in place, never appends.
--
--   entity_type 'cv'      → entity_id = job_id   (the intake brain-dump for a role)
--   entity_type 'job'/'skill'/'company'          (reserved for future private notes)
--
-- PV1: the raw story stays private to the author. Token-scoped writes (OQ2).
--
-- Manual-apply (feedback_supabase_migrations_manual) — run via Supabase MCP
-- apply_migration BEFORE deploying the private_notes router. Until it lands the
-- repo's safe_read degrades reads to "no note" and PostgREST 404s the upsert.

CREATE TABLE IF NOT EXISTS public.private_notes (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type  text NOT NULL CHECK (entity_type IN ('job', 'skill', 'company', 'cv')),
    entity_id    text NOT NULL,
    body         text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, entity_type, entity_id)
);

ALTER TABLE public.private_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY private_notes_own_select ON public.private_notes
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY private_notes_own_insert ON public.private_notes
        FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY private_notes_own_update ON public.private_notes
        FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY private_notes_own_delete ON public.private_notes
        FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.private_notes IS
    'Own-only private notes per entity (no public feed). Backs CV-intake story save. RLS own-only.';

NOTIFY pgrst, 'reload schema';
