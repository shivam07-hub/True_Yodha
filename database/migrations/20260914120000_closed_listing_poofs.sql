-- Gone is gone. A miss, a verifier close, or a user "this link is dead"
-- writes `closed` and starts the one-hour unload. Collection drops the card.
-- People still sitting on it get one notification. Apply intents die with it.
-- Tailored CVs stay. Backfill of old miss / likely_closed rows skips the ping.

BEGIN;

CREATE OR REPLACE FUNCTION private.capture_job_feedback_observation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    observation_result TEXT;
    observation_strength TEXT;
    eligible_at TIMESTAMPTZ;
BEGIN
    IF NEW.feedback_kind <> 'quality' OR NEW.reason_code NOT IN (
        'apply_link_closed', 'apply_link_live', 'apply_redirected',
        'apply_wrong_role', 'apply_technical_error', 'posting_inactive'
    ) THEN
        RETURN NEW;
    END IF;

    observation_result := CASE NEW.reason_code
        WHEN 'apply_link_live' THEN 'apply_live'
        WHEN 'apply_link_closed' THEN 'closed'
        WHEN 'posting_inactive' THEN 'closed'
        WHEN 'apply_redirected' THEN 'redirected'
        WHEN 'apply_wrong_role' THEN 'wrong_role'
        ELSE 'error'
    END;
    observation_strength := CASE
        WHEN observation_result IN ('apply_live', 'closed') THEN 'strong'
        WHEN observation_result IN ('redirected', 'wrong_role') THEN 'medium'
        ELSE 'weak'
    END;

    INSERT INTO public.job_listing_observations (
        job_id, user_id, client_event_id, observer, result, strength,
        observed_at, evidence, verifier_version
    ) VALUES (
        NEW.job_id, NEW.user_id, NEW.client_event_id, 'user',
        observation_result, observation_strength, NEW.created_at,
        jsonb_build_object('surface', NEW.surface, 'feedback_event_id', NEW.id),
        'feedback-v1'
    ) ON CONFLICT (user_id, client_event_id) DO NOTHING;

    IF observation_result = 'apply_live' THEN
        UPDATE public.jobs SET
            listing_confidence = 'active',
            last_verified_live_at = GREATEST(last_verified_live_at, NEW.created_at),
            last_verification_attempt_at = NEW.created_at,
            consecutive_complete_misses = 0,
            confidence_reason = 'user_confirmed_live',
            quarantined_at = NULL,
            quarantine_until = NULL,
            deletion_eligible_at = NULL,
            retired_at = NULL,
            reactivated_at = CASE
                WHEN listing_confidence IN ('likely_closed', 'closed') THEN NEW.created_at
                ELSE reactivated_at
            END,
            is_active = TRUE,
            lifecycle_updated_at = NOW()
        WHERE job_id = NEW.job_id;
    ELSIF observation_result = 'closed' THEN
        eligible_at := NEW.created_at + interval '1 hour';
        UPDATE public.jobs SET
            listing_confidence = 'closed',
            is_active = FALSE,
            last_verification_attempt_at = NEW.created_at,
            last_conclusive_verification_at = NEW.created_at,
            confidence_reason = 'user_closed',
            quarantined_at = COALESCE(quarantined_at, NEW.created_at),
            quarantine_until = COALESCE(quarantine_until, eligible_at),
            deletion_eligible_at = COALESCE(deletion_eligible_at, eligible_at),
            retired_at = COALESCE(retired_at, NEW.created_at),
            lifecycle_updated_at = NOW()
        WHERE job_id = NEW.job_id
          AND listing_confidence IS DISTINCT FROM 'closed';
    ELSE
        UPDATE public.jobs SET
            listing_confidence = CASE
                WHEN listing_confidence IN ('likely_closed', 'closed')
                    THEN listing_confidence
                ELSE 'uncertain'
            END,
            last_verification_attempt_at = NEW.created_at,
            confidence_reason = 'user_' || observation_result,
            lifecycle_updated_at = NOW()
        WHERE job_id = NEW.job_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.poof_closed_listing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    recipient uuid;
    headline text;
BEGIN
    headline := COALESCE(NULLIF(btrim(NEW.job_title), ''), 'A role you were on');

    FOR recipient IN
        SELECT w.user_id
        FROM (
            SELECT user_id FROM public.user_job_matches WHERE job_id = NEW.job_id
            UNION
            SELECT user_id FROM public.job_applications
             WHERE job_id = NEW.job_id
               AND COALESCE(status, 'saved') = 'saved'
            UNION
            SELECT user_id FROM public.cv_versions
             WHERE job_id = NEW.job_id AND user_id IS NOT NULL
            UNION
            SELECT user_id FROM public.job_apply_intents WHERE job_id = NEW.job_id
        ) w
        WHERE NOT EXISTS (
            SELECT 1 FROM public.job_applications a
             WHERE a.user_id = w.user_id
               AND a.job_id = NEW.job_id
               AND COALESCE(a.status, 'saved') <> 'saved'
        )
    LOOP
        INSERT INTO public.user_notifications (
            user_id, kind, source_id, job_id, title, body,
            action_url, state, match_count, read_at, created_at
        ) VALUES (
            recipient,
            'listing_vanished',
            NEW.job_id,
            NEW.job_id,
            headline || ' is gone',
            'This listing vanished while you were still on it. Next time, finish the CV and apply.',
            '/market',
            NULL,
            1,
            NULL,
            NOW()
        )
        ON CONFLICT (user_id, kind, source_id) DO UPDATE
            SET read_at = NULL,
                created_at = NOW(),
                title = EXCLUDED.title,
                body = EXCLUDED.body,
                action_url = EXCLUDED.action_url;
    END LOOP;

    DELETE FROM public.job_apply_intents WHERE job_id = NEW.job_id;
    RETURN NEW;
END;
$$;

-- Drain the old miss / likely_closed holding pen BEFORE the poof trigger
-- exists, so this FIFO close does not ping. Dashboard cannot set
-- session_replication_role.
UPDATE public.jobs SET
    listing_confidence = 'closed',
    is_active = FALSE,
    confidence_reason = COALESCE(confidence_reason, 'close_means_closed_backfill'),
    quarantined_at = COALESCE(quarantined_at, NOW()),
    quarantine_until = COALESCE(quarantine_until, NOW()),
    deletion_eligible_at = COALESCE(deletion_eligible_at, NOW()),
    retired_at = COALESCE(retired_at, NOW()),
    lifecycle_updated_at = NOW()
 WHERE listing_confidence = 'likely_closed'
    OR (
        listing_confidence = 'uncertain'
        AND consecutive_complete_misses >= 1
    );

DROP TRIGGER IF EXISTS trg_poof_closed_listing ON public.jobs;
CREATE TRIGGER trg_poof_closed_listing
    AFTER UPDATE OF listing_confidence ON public.jobs
    FOR EACH ROW
    WHEN (
        NEW.listing_confidence = 'closed'
        AND OLD.listing_confidence IS DISTINCT FROM 'closed'
        AND OLD.listing_confidence IS DISTINCT FROM 'likely_closed'
    )
    EXECUTE FUNCTION private.poof_closed_listing();

-- Dashboard cannot set session_replication_role. Child DELETE triggers already
-- no-op when the job row is gone (20260914002000 WHEN EXISTS).
CREATE OR REPLACE FUNCTION public.retire_closed_jobs(
    p_limit INTEGER DEFAULT 500,
    p_job_ids TEXT[] DEFAULT NULL
)
RETURNS TABLE(job_id TEXT, deleted_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    candidate RECORD;
    snapshot JSONB;
    applications INTEGER;
    versions INTEGER;
    retired_at TIMESTAMPTZ;
    take INTEGER;
BEGIN
    IF p_limit < 1 OR p_limit > 5000 THEN
        RAISE EXCEPTION 'p_limit must be between 1 and 5000';
    END IF;
    IF p_job_ids IS NULL OR COALESCE(array_length(p_job_ids, 1), 0) = 0 THEN
        RAISE EXCEPTION 'p_job_ids required; archive the rows before retire_closed_jobs';
    END IF;
    take := LEAST(p_limit, array_length(p_job_ids, 1));

    FOR candidate IN
        SELECT j.*
        FROM public.jobs j
        WHERE j.listing_confidence = 'closed'
          AND j.deletion_eligible_at IS NOT NULL
          AND j.deletion_eligible_at <= NOW()
          AND COALESCE(j.quarantine_until, j.deletion_eligible_at) <= NOW()
          AND j.job_id = ANY (p_job_ids)
        ORDER BY j.deletion_eligible_at, j.job_id
        LIMIT take
        FOR UPDATE OF j SKIP LOCKED
    LOOP
        snapshot := private.job_snapshot_for(candidate.job_id);
        UPDATE public.job_applications
        SET job_snapshot = COALESCE(job_snapshot, snapshot)
        WHERE public.job_applications.job_id = candidate.job_id;
        UPDATE public.cv_versions
        SET job_snapshot = COALESCE(job_snapshot, snapshot)
        WHERE public.cv_versions.job_id = candidate.job_id;
        UPDATE public.cv_application_attempts
        SET job_snapshot = COALESCE(job_snapshot, snapshot)
        WHERE public.cv_application_attempts.job_id = candidate.job_id;
        UPDATE public.job_application_skill_targets
        SET job_snapshot = COALESCE(job_snapshot, snapshot)
        WHERE public.job_application_skill_targets.job_id = candidate.job_id;
        UPDATE public.job_application_milestones
        SET job_snapshot = COALESCE(job_snapshot, snapshot)
        WHERE public.job_application_milestones.job_id = candidate.job_id;

        SELECT COUNT(*) INTO applications
        FROM public.job_applications a WHERE a.job_id = candidate.job_id;
        SELECT COUNT(*) INTO versions
        FROM public.cv_versions v WHERE v.job_id = candidate.job_id;

        INSERT INTO public.job_retirement_events (
            job_id, company_id, lifecycle_reason, closed_at,
            application_count, cv_version_count, source_run_id
        ) VALUES (
            candidate.job_id, candidate.company_id, candidate.confidence_reason,
            candidate.retired_at, applications, versions, candidate.last_source_run_id
        ) RETURNING public.job_retirement_events.deleted_at INTO retired_at;

        DELETE FROM public.jobs j WHERE j.job_id = candidate.job_id;
        job_id := candidate.job_id;
        deleted_at := retired_at;
        RETURN NEXT;
    END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
