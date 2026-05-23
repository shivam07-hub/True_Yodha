-- 20260523 — cv_upload_jobs + welcome XP pre-grant backfill
--
-- Implements ADR-0004 phase 1:
--   * cv_upload_jobs: async LLM parse status surface (mirrors SE17 recompute pattern)
--   * Backfills welcome XP for users who signed up before pre-grant moved to signup-time.
--     Future signups grant at the app layer in ensure_user_provisioned (idempotent via
--     welcome_xp_granted flag) — no DB trigger so the grant code path stays visible in app code.

-- ── 1. cv_upload_jobs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cv_upload_jobs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status          text NOT NULL CHECK (status IN ('processing', 'done', 'failed')),
    skills_detected integer,
    score           numeric,
    error_detail    text,
    error_code      text,           -- 'provider_unavailable' | 'no_skills' | 'taxonomy_unmapped' | 'internal'
    xp_charged      integer NOT NULL DEFAULT 0,
    xp_refunded     boolean NOT NULL DEFAULT false,
    content_hash    text,           -- denormalised for debugging dedupe paths
    created_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cv_upload_jobs_user_created
    ON public.cv_upload_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cv_upload_jobs_status_processing
    ON public.cv_upload_jobs (status)
    WHERE status = 'processing';

ALTER TABLE public.cv_upload_jobs ENABLE ROW LEVEL SECURITY;

-- Users see their own job rows (status polling). Writes restricted to service role.
DROP POLICY IF EXISTS cv_upload_jobs_select_own ON public.cv_upload_jobs;
CREATE POLICY cv_upload_jobs_select_own
    ON public.cv_upload_jobs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Service role bypasses RLS for INSERT/UPDATE; no policies needed there.

COMMENT ON TABLE  public.cv_upload_jobs IS 'Async CV upload job status. POST /cv/upload returns 202+id; client polls GET /cv/upload/status/{id}.';
COMMENT ON COLUMN public.cv_upload_jobs.xp_refunded IS 'TRUE once a refund has been credited back. Idempotency guard: refund handlers must check this flag before crediting.';

-- ── 2. Backfill welcome XP for pre-existing users ─────────────────────────────
-- One-time grant for users who signed up before ADR-0004 moved welcome XP to signup.
-- Idempotent (welcome_xp_granted = FALSE guard) — running twice does nothing.
WITH grants AS (
    UPDATE public.user_profiles
    SET xp_balance         = xp_balance + 3000,
        welcome_xp_granted = TRUE
    WHERE welcome_xp_granted = FALSE
    RETURNING id, xp_balance
)
SELECT count(*) AS users_backfilled FROM grants;

NOTIFY pgrst, 'reload schema';
