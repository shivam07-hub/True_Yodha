-- 20260704 — user_connections (backlog #35 slice 5, ADR-0018 Path 1)
--
-- The user's OWN LinkedIn connections, uploaded from their own data export
-- (Settings → Get a copy of your data → Connections). Used only to surface
-- warm intros at a target company inside their reach pack. User-owned,
-- consented, DPDP-clean — strictly optional (the pack works without it).
--
-- Own-only (RLS). Delete allowed so the user can clear their upload. Re-upload
-- replaces the set (the router deletes then inserts). full_name is the display
-- name from the export; we never store connection emails/URLs — only what a
-- warm-intro suggestion needs (name, company, position).
--
-- Manual-apply (feedback_supabase_migrations_manual) — run via Supabase MCP
-- apply_migration + `NOTIFY pgrst, 'reload schema';` BEFORE deploying the
-- connections router.

CREATE TABLE IF NOT EXISTS public.user_connections (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name     text NOT NULL,
    company       text,
    position      text,
    connected_on  text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Warm-intro lookups are always (user, company); index the lowercased company.
CREATE INDEX IF NOT EXISTS idx_user_connections_user_company
    ON public.user_connections (user_id, lower(company));

ALTER TABLE public.user_connections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY user_connections_own_select ON public.user_connections
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY user_connections_own_insert ON public.user_connections
        FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY user_connections_own_delete ON public.user_connections
        FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
