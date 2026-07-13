-- 20260713_match_6block_strategy.sql
-- Standardized matcher (career-ops end-to-end): the Career Ops eval gains a
-- per-candidate STRATEGY block on top of the 5-axis score — level_strategy (level
-- fit + how to play it), personalization (how THIS candidate should tailor their
-- application, grounded in the CV), and star_pointers (the candidate's own real
-- STAR stories to cite; no-fabrication per ADR-0016). Ran script-side for the
-- Rishabh case study; this persists it so every run writes it and the read seam
-- (MatchEval -> to_job_match -> JobMatchResponse) surfaces it with no extra query.
--
-- Additive + idempotent. TEXT columns nullable (absent until the next recompute);
-- star_pointers NOT NULL DEFAULT '[]' mirrors matched_skills/missing_skills exactly,
-- so existing rows backfill to an empty list and the tolerant MatchEval read never
-- narrows. New rows get the real values on the next Match Run.
ALTER TABLE user_job_matches
    ADD COLUMN IF NOT EXISTS level_strategy text,
    ADD COLUMN IF NOT EXISTS personalization text,
    ADD COLUMN IF NOT EXISTS star_pointers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- PostgREST: reload schema cache so the new columns are selectable immediately.
NOTIFY pgrst, 'reload schema';
