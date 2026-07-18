-- Durable CV-analysis lifecycle inside the existing notification inbox.
-- One row follows one cv_upload_jobs row through processing -> ready/failed.

ALTER TABLE public.user_notifications
    ADD COLUMN IF NOT EXISTS source_id text,
    ADD COLUMN IF NOT EXISTS action_url text,
    ADD COLUMN IF NOT EXISTS state text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notifications_source
    ON public.user_notifications (user_id, kind, source_id);

ALTER TABLE public.user_notifications
    DROP CONSTRAINT IF EXISTS user_notifications_state_check;
ALTER TABLE public.user_notifications
    ADD CONSTRAINT user_notifications_state_check
    CHECK (state IS NULL OR state IN ('processing', 'ready', 'failed'));

NOTIFY pgrst, 'reload schema';
