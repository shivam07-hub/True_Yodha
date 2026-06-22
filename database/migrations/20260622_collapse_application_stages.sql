-- Collapse application stages 5 → 3 (2026-06-22 grill-me session)
--
-- Pipeline lanes reduced to the three users actually reason about:
--   saved → applied → interviewing
-- Outcomes reduced to three:
--   ghosted, rejected, offer
--
-- `job_applications.status` is a free TEXT column validated in the app layer
-- (backend APPLICATION_STAGES / APPLICATION_OUTCOMES), so there is no enum/CHECK
-- type to migrate — only existing rows carrying retired values need a remap.
--
-- Decisions locked in the grill:
--   screening   → interviewing   (a recruiter screen = in-process; matches the
--                                  existing job_path "interview" grouping)
--   final_round → interviewing
--   withdrew    → rejected       (fold into the negative-close bucket)
--
-- Run order: deploy code first (so no fresh writes land on retired values),
-- then this migration.

-- ── Audit BEFORE ────────────────────────────────────────────────────────────
-- SELECT status, COUNT(*) FROM job_applications GROUP BY status ORDER BY 2 DESC;
-- Expected affected (snapshot 2026-06-22): screening=4, withdrew=1, final_round=0.

UPDATE job_applications SET status = 'interviewing' WHERE status IN ('screening', 'final_round');
UPDATE job_applications SET status = 'rejected'     WHERE status = 'withdrew';

-- ── Audit AFTER ─────────────────────────────────────────────────────────────
-- SELECT status, COUNT(*) FROM job_applications GROUP BY status ORDER BY 2 DESC;
-- Expect only: saved, applied, interviewing, ghosted, rejected, offer.
--
-- Note: the get_job_intelligence aggregation function (20260613_job_intelligence.sql)
-- still lists 'screening'/'final_round'/'withdrew' in its FILTER (... IN ...) clauses.
-- Those are now harmless dead values — no row can carry them after this remap — so
-- the function needs no change for correctness.
