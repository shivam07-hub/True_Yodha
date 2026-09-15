-- 20260915 — reach_targets (ADR-0018 Path 3)
--
-- User-nominated LinkedIn /in/{vanity} URLs plus a send ledger. The user
-- pasted the URL and typed the name; Myro never fetched the profile and
-- never sends. Own-only (RLS). job_id is optional so a desk prospect can
-- exist with no collected job.
--
-- Additive. Apply via Supabase + `NOTIFY pgrst, 'reload schema';`

CREATE TABLE IF NOT EXISTS public.reach_targets (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id           text,
    profile_url      text NOT NULL,
    display_name     text NOT NULL,
    company          text,
    role_title       text,
    status           text NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued', 'sent', 'followed_up', 'replied', 'stopped')),
    connect_note     text NOT NULL DEFAULT '',
    followup_note    text NOT NULL DEFAULT '',
    referral_ask     text NOT NULL DEFAULT '',
    sent_at          timestamptz,
    followup_due_at  timestamptz,
    replied_at       timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reach_targets_user_job_url
    ON public.reach_targets (user_id, coalesce(job_id, ''), profile_url);

CREATE INDEX IF NOT EXISTS idx_reach_targets_user_due
    ON public.reach_targets (user_id, status, followup_due_at)
    WHERE status = 'sent';

ALTER TABLE public.reach_targets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY reach_targets_own_select ON public.reach_targets
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY reach_targets_own_insert ON public.reach_targets
        FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY reach_targets_own_update ON public.reach_targets
        FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY reach_targets_own_delete ON public.reach_targets
        FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reach_targets TO authenticated;
GRANT ALL ON public.reach_targets TO service_role;

NOTIFY pgrst, 'reload schema';
