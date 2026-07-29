-- A heart is durable apply/preparation intent, not a presentation-only save.
-- The state stays on the user-owned job_applications row and inherits its RLS.

ALTER TABLE public.job_applications
    ADD COLUMN IF NOT EXISTS is_priority boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS priority_marked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_job_applications_priority_queue
    ON public.job_applications (user_id, priority_marked_at DESC)
    WHERE is_priority = true;

COMMENT ON COLUMN public.job_applications.is_priority IS
    'Explicit user intent: lead Collections apply/preparation work and future preference-aware discovery.';
