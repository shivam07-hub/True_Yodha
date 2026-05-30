-- 20260530d — job_deepenings + user_profiles.deepening_sampled (Q8 deepeners)
--
-- Dashboard mobile-feed / desktop-grid Q8: XP-gated follow-up answers per job
-- ("What lifts my fit?", "Their interview funnel?", "Compare me to a typical
-- hire"). 5 XP each, charge-on-success, cached per (user, job, prompt_key) so a
-- re-tap replays free. First deepener per account is free — tracked by the
-- deepening_sampled flag on user_profiles.
--
-- Manual-apply (per feedback_supabase_migrations_manual) — run via Supabase MCP
-- apply_migration before deploying the backend deepen router.

CREATE TABLE IF NOT EXISTS public.job_deepenings (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id      text NOT NULL,
    prompt_key  text NOT NULL,
    answer      text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, job_id, prompt_key)
);

CREATE INDEX IF NOT EXISTS idx_job_deepenings_user_job
    ON public.job_deepenings (user_id, job_id);

-- RLS: a user reads only their own deepenings; writes go through the admin
-- client (service role bypasses RLS) per the repository pattern.
ALTER TABLE public.job_deepenings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY job_deepenings_own_select ON public.job_deepenings
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS deepening_sampled boolean NOT NULL DEFAULT false;

COMMENT ON TABLE public.job_deepenings IS
    'Q8 XP-gated deepener answers, cached per (user, job, prompt_key). Idempotent re-tap = free replay.';
COMMENT ON COLUMN public.user_profiles.deepening_sampled IS
    'Q8 — TRUE once the account has used its one free deepener. Subsequent deepeners cost 5 XP.';

NOTIFY pgrst, 'reload schema';
