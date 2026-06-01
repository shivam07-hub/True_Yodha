-- 20260601b — dashboard job-card dismissals
--
-- Home dashboard autonomy: Myro match cards stay in the user's durable stack
-- until the user explicitly removes that card. Removal is a dashboard-level
-- dismissal, not a tracker delete; tracker/application rows and historical
-- match rows remain available for other surfaces and audits.

CREATE TABLE IF NOT EXISTS public.user_dismissed_job_cards (
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id       text NOT NULL,
    dismissed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_user_dismissed_job_cards_user
    ON public.user_dismissed_job_cards (user_id, dismissed_at DESC);

ALTER TABLE public.user_dismissed_job_cards ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY user_dismissed_job_cards_own_select ON public.user_dismissed_job_cards
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY user_dismissed_job_cards_own_insert ON public.user_dismissed_job_cards
        FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY user_dismissed_job_cards_own_delete ON public.user_dismissed_job_cards
        FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, DELETE ON public.user_dismissed_job_cards TO authenticated;

COMMENT ON TABLE public.user_dismissed_job_cards IS
    'Per-user Home dashboard job-card dismissals. Keeps historical match rows intact while hiding explicitly removed cards.';

NOTIFY pgrst, 'reload schema';
