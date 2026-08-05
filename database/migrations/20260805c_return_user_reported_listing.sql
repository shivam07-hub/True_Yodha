-- 2026-08-05 · dead-listing report, slice 5
--
-- Closing the loop opened by the user-report path.
--
-- A user reports a listing dead: it drops to `likely_closed` for everyone and is
-- dismissed from that user's own feed, so they stop being shown a dead end. The
-- verifier still overrules — jobs do come back. But without this, the reopen was
-- silent: the row would quietly return to the corpus while staying dismissed for
-- the one person who cared enough to report it, and who in this case had already
-- spent a tailoring run on it. The reporter is the last person who should be
-- locked out of a job that turned out to be live.
--
-- Fires only on the exact transition — something the verifier wrote back to
-- `active` over a `user_closed` verdict — so it costs nothing on the ordinary
-- verification path and needs no extra round trip from the application.
CREATE OR REPLACE FUNCTION private.return_user_reported_listing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    reporter RECORD;
BEGIN
    FOR reporter IN
        SELECT DISTINCT o.user_id
          FROM public.job_listing_observations o
         WHERE o.job_id = NEW.job_id
           AND o.observer = 'user'
           AND o.result = 'closed'
           AND o.user_id IS NOT NULL
    LOOP
        -- Hand the job back: undo only the dismissal this report created.
        DELETE FROM public.user_dismissed_job_cards
         WHERE user_id = reporter.user_id
           AND job_id = NEW.job_id;

        -- And say so. A job reappearing with no explanation is the same silence
        -- the report itself used to answer with.
        INSERT INTO public.user_notifications (
            user_id, kind, source_id, job_id, title, body,
            action_url, state, match_count, read_at, created_at
        ) VALUES (
            reporter.user_id,
            'listing_reopened',
            NEW.job_id,
            NEW.job_id,
            COALESCE(NEW.job_title, 'A role you reported') || ' is open again',
            'You reported this listing as closed. Myro just verified it live.',
            '/cv?jobId=' || NEW.job_id,
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
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_return_user_reported_listing ON public.jobs;
CREATE TRIGGER trg_return_user_reported_listing
    AFTER UPDATE OF listing_confidence ON public.jobs
    FOR EACH ROW
    WHEN (
        NEW.listing_confidence = 'active'
        AND OLD.listing_confidence IS DISTINCT FROM 'active'
        AND OLD.confidence_reason = 'user_closed'
    )
    EXECUTE FUNCTION private.return_user_reported_listing();
