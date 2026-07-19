-- Collections attention: source-owned reminder state for saved applications.
-- The inbox is a projection; this table remains the durable truth of whether a
-- saved role is snoozed or has already advanced through an attention checkpoint.

ALTER TABLE public.job_applications
    ADD COLUMN IF NOT EXISTS collection_snoozed_until timestamptz,
    ADD COLUMN IF NOT EXISTS collection_attention_level text,
    ADD COLUMN IF NOT EXISTS collection_last_reminded_at timestamptz;

ALTER TABLE public.job_applications
    DROP CONSTRAINT IF EXISTS job_applications_collection_attention_level_check;
ALTER TABLE public.job_applications
    ADD CONSTRAINT job_applications_collection_attention_level_check
    CHECK (collection_attention_level IS NULL OR collection_attention_level IN ('review', 'decide', 'urgent'));

CREATE INDEX IF NOT EXISTS idx_job_applications_saved_attention
    ON public.job_applications (created_at, collection_snoozed_until)
    WHERE status = 'saved';

-- `idx_user_notifications_source` already enforces one lifecycle row per
-- (user, kind, source_id). source_id is the canonical job_id because the
-- application row can be removed and restored by the reversible dismissal flow.

NOTIFY pgrst, 'reload schema';
