-- A 300ms server response is not a 300ms wait on 3G, and ~10% of uploaders are
-- on 3G or 2G (32 of 328 by cv_upload_phase_events.network_type). Without the
-- connection class, a slow route and a slow network are the same row, and the
-- fix for one is wasted on the other.
--
-- Additive and nullable: every existing row (there are none — see
-- ARCHITECTURE_READ_PATH §19.2) and every client that does not send it stay valid.

ALTER TABLE public.route_perf_events
    ADD COLUMN IF NOT EXISTS network_type TEXT;

NOTIFY pgrst, 'reload schema';
