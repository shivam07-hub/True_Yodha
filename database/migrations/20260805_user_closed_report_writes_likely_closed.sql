-- 2026-08-05 · dead-listing report, slice 1
--
-- A user's "this listing is dead" was capped at `uncertain`, while their
-- "it's live" wrote a full `active` + un-retire. That asymmetry meant an honest
-- report changed nothing a user could see: `uncertain` does not reach
-- isPulseClosed() in the frontend, so the row never moved to the Collections
-- "Closed" chip and the apply gate never armed.
--
-- A `closed` observation now writes `likely_closed` — the same verdict the
-- verifier writes for an unconfirmed close. It is deliberately NOT `closed`:
-- that terminal state quarantines and retires the row, and one user report is
-- not strong enough for that. The verifier still overrules on the next
-- `seen_live`, so this is a fast provisional call, not a permanent one.
--
-- `redirected` / `wrong_role` / `error` keep landing on `uncertain`: they say
-- the listing is wrong or unreadable, not that it is gone.
CREATE OR REPLACE FUNCTION private.capture_job_feedback_observation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    observation_result TEXT;
    observation_strength TEXT;
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
        UPDATE public.jobs SET
            listing_confidence = CASE
                WHEN listing_confidence = 'closed' THEN 'closed'
                ELSE 'likely_closed'
            END,
            last_verification_attempt_at = NEW.created_at,
            confidence_reason = 'user_closed',
            lifecycle_updated_at = NOW()
        WHERE job_id = NEW.job_id;
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

-- One row was capped by the old rule before it changed.
UPDATE public.jobs
   SET listing_confidence = 'likely_closed', lifecycle_updated_at = NOW()
 WHERE confidence_reason = 'user_closed'
   AND listing_confidence = 'uncertain';
