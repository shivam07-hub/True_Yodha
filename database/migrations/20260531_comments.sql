-- 20260531 — comments (PR-B: "Comments on cards")
--
-- The freeform daily diary is retired; reborn as private contextual note
-- threads attached to a specific card:
--   entity_type 'job'     → entity_id = jobs.job_id        (dashboard job card)
--   entity_type 'skill'   → entity_id = skill taxonomy_key (Practice skill card)
--   entity_type 'company' → entity_id = company name       (/companies/[slug])
--
-- Many notes per entity (a thread), newest-first, own-only (RLS). No XP, no
-- LLM skill-delta tagging, no score coupling — inert private notes. daily_logs
-- stays frozen as read-only history; nothing is migrated into here (old entries
-- aren't entity-keyed). Token-scoped writes (OQ2) → full CRUD RLS on own rows.
--
-- Manual-apply (per feedback_supabase_migrations_manual) — run via Supabase MCP
-- apply_migration before deploying the backend comments router.

CREATE TABLE IF NOT EXISTS public.comments (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type  text NOT NULL CHECK (entity_type IN ('job', 'skill', 'company')),
    entity_id    text NOT NULL,
    body         text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_user_entity
    ON public.comments (user_id, entity_type, entity_id, created_at DESC);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY comments_own_select ON public.comments
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY comments_own_insert ON public.comments
        FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY comments_own_update ON public.comments
        FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY comments_own_delete ON public.comments
        FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.comments IS
    'PR-B private note threads on job/skill cards. No XP, no score coupling. RLS own-only.';

NOTIFY pgrst, 'reload schema';
