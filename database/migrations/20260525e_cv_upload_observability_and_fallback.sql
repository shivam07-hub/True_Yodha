-- 20260525e — CV upload telemetry phases + fallback submission rail

CREATE TABLE IF NOT EXISTS public.cv_upload_phase_events (
    id              bigserial PRIMARY KEY,
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    phase           text NOT NULL CHECK (phase IN ('pick', 'signed-url', 'put', 'poll', 'parse')),
    outcome         text NOT NULL CHECK (outcome IN ('started', 'succeeded', 'failed', 'retrying', 'skipped')),
    attempt         integer,
    job_id          text,
    idempotency_key text,
    reason_code     text,
    error_detail    text,
    http_status     integer,
    file_name       text,
    file_mime       text,
    file_size_bytes integer,
    route           text,
    network_type    text,
    occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cv_upload_phase_events_phase_window
    ON public.cv_upload_phase_events (phase, outcome, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_cv_upload_phase_events_user_window
    ON public.cv_upload_phase_events (user_id, occurred_at DESC);

ALTER TABLE public.cv_upload_phase_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cv_upload_phase_events_select_own ON public.cv_upload_phase_events;
CREATE POLICY cv_upload_phase_events_select_own
    ON public.cv_upload_phase_events
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.cv_upload_fallback_requests (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    support_token       text NOT NULL UNIQUE,
    attempts            integer NOT NULL CHECK (attempts >= 1),
    reason_code         text NOT NULL,
    last_error          text,
    file_name           text,
    file_mime           text,
    file_size_bytes     integer,
    route               text,
    assignment_deadline date,
    status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cv_upload_fallback_requests_user_created
    ON public.cv_upload_fallback_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cv_upload_fallback_requests_status_created
    ON public.cv_upload_fallback_requests (status, created_at DESC);

ALTER TABLE public.cv_upload_fallback_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cv_upload_fallback_requests_select_own ON public.cv_upload_fallback_requests;
CREATE POLICY cv_upload_fallback_requests_select_own
    ON public.cv_upload_fallback_requests
    FOR SELECT
    USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
