-- Search-query logging (User Memory Phase 2 prerequisite).
--
-- Neither the landing NL search (/public/job-search) nor the authed search
-- (/jobs/search) persists what the user actually asked for. Those queries are
-- the highest-intent signal we have ("remote PM under 3 yrs") — captured here to
-- feed (a) on-login memory distillation, (b) dissatisfaction detection for the
-- Delta-4 intent chat, (c) the "search that knows me" re-rank.
--
-- Anon (landing) rows carry user_id NULL + a session token; authed rows carry
-- user_id. Writes are best-effort service-role (fire-and-forget, never block a
-- search). RLS lets a signed-in user read their OWN history; the distiller reads
-- via the admin client.
--
-- Manual-apply then NOTIFY pgrst.

CREATE TABLE IF NOT EXISTS public.search_queries (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,   -- NULL for anon
    session_id    text,                                               -- anon correlation
    surface       text NOT NULL CHECK (surface IN ('landing', 'market', 'intent_chat')),
    query         text NOT NULL,
    parsed        jsonb,                                              -- job_query_parser output
    result_count  integer,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_queries_user_created
    ON public.search_queries (user_id, created_at DESC);

ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY search_queries_own_select ON public.search_queries
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.search_queries IS
    'Per-user + anon search intent log. Feeds memory distillation, dissatisfaction detection, and personalised re-rank. Best-effort service-role writes; RLS own-select.';

NOTIFY pgrst, 'reload schema';
