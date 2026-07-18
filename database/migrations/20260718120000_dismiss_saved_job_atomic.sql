-- A saved-job dislike is one transaction: remove the user's pending intent and
-- hide the recommendation everywhere, while preserving the canonical match.

ALTER TABLE public.user_dismissed_job_cards
    ADD COLUMN IF NOT EXISTS prior_application jsonb;

CREATE OR REPLACE FUNCTION public.dismiss_saved_job(p_job_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_prior_application jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.job_applications AS application
    WHERE application.user_id = v_user_id
      AND application.job_id = p_job_id
      AND application.status = 'saved'
    RETURNING to_jsonb(application.*) INTO v_prior_application;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Saved application not found' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.user_dismissed_job_cards
    WHERE user_id = v_user_id AND job_id = p_job_id;

    INSERT INTO public.user_dismissed_job_cards (
        user_id,
        job_id,
        dismissed_at,
        prior_application
    )
    VALUES (v_user_id, p_job_id, now(), v_prior_application);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_saved_job(p_job_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_prior_application jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT dismissal.prior_application
    INTO v_prior_application
    FROM public.user_dismissed_job_cards AS dismissal
    WHERE dismissal.user_id = v_user_id
      AND dismissal.job_id = p_job_id;

    IF v_prior_application IS NULL THEN
        RAISE EXCEPTION 'Dismissed saved application not found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.job_applications (
        user_id,
        job_id,
        match_id,
        status,
        applied_at,
        company_response,
        response_at,
        checkin_sent_at,
        followed_up_at,
        closed_at,
        offer_received_at,
        notes,
        created_at,
        updated_at,
        last_stage_changed_at,
        source,
        job_snapshot
    )
    VALUES (
        v_user_id,
        p_job_id,
        NULLIF(v_prior_application ->> 'match_id', '')::integer,
        'saved',
        NULLIF(v_prior_application ->> 'applied_at', '')::timestamptz,
        v_prior_application ->> 'company_response',
        NULLIF(v_prior_application ->> 'response_at', '')::timestamptz,
        NULLIF(v_prior_application ->> 'checkin_sent_at', '')::timestamptz,
        NULLIF(v_prior_application ->> 'followed_up_at', '')::timestamptz,
        NULLIF(v_prior_application ->> 'closed_at', '')::timestamptz,
        NULLIF(v_prior_application ->> 'offer_received_at', '')::timestamptz,
        v_prior_application ->> 'notes',
        COALESCE(
            NULLIF(v_prior_application ->> 'created_at', '')::timestamptz,
            now()
        ),
        COALESCE(
            NULLIF(v_prior_application ->> 'updated_at', '')::timestamptz,
            now()
        ),
        COALESCE(
            NULLIF(v_prior_application ->> 'last_stage_changed_at', '')::timestamptz,
            now()
        ),
        COALESCE(v_prior_application ->> 'source', 'system_match'),
        v_prior_application -> 'job_snapshot'
    )
    ON CONFLICT (user_id, job_id) DO NOTHING;

    DELETE FROM public.user_dismissed_job_cards
    WHERE user_id = v_user_id AND job_id = p_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_saved_job(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_saved_job(text) TO authenticated;
REVOKE ALL ON FUNCTION public.restore_saved_job(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_saved_job(text) TO authenticated;

COMMENT ON FUNCTION public.dismiss_saved_job(text) IS
    'Atomically removes a saved intent and records Not Interested without deleting match history.';
COMMENT ON FUNCTION public.restore_saved_job(text) IS
    'Undo for a saved-job dismissal. Restores the prior saved intent and clears Not Interested.';

NOTIFY pgrst, 'reload schema';
