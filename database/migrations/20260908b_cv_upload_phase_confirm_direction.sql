-- 20260908b — the two phases that were added to close the blind spot could
-- never be written.
--
-- `confirm` and `direction` were added to the telemetry Literal
-- (app/routers/telemetry.py:37) so skill confirmation and Direction would stop
-- being invisible — the blind spot that made the 273-stranded-user
-- investigation reconstruct-from-end-state instead of read-from-events. No
-- migration widened the CHECK, so every one of those events raised an APIError
-- inside the BackgroundTask, after the route had already answered 202.
--
-- Measured before this migration: 7 days of events hold pick / signed-url /
-- put / poll / parse and ZERO confirm, ZERO direction.

ALTER TABLE public.cv_upload_phase_events
    DROP CONSTRAINT IF EXISTS cv_upload_phase_events_phase_check;

ALTER TABLE public.cv_upload_phase_events
    ADD CONSTRAINT cv_upload_phase_events_phase_check
    CHECK (phase IN ('pick', 'signed-url', 'put', 'poll', 'parse',
                     'confirm', 'direction'));
