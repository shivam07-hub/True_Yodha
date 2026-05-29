-- 20260530 — Matching Brain: 5-axis Career Ops evaluation fields on user_job_matches
--
-- Stage-2 of the matcher moves from {llm_rank, llm_explanation} to the Career Ops
-- brain: per-job 5-axis scoring + grade + Apply/Negotiate/Skip verdict + application
-- angle + strengths/concerns. All columns nullable so existing rows and the LLM-
-- failure fallback (overlap score only) remain valid.
--
-- Plan: docs/MATCHING_BRAIN_CHANGE.md

BEGIN;

ALTER TABLE public.user_job_matches
    ADD COLUMN IF NOT EXISTS overall_score      NUMERIC,        -- 0.0–5.0
    ADD COLUMN IF NOT EXISTS grade              TEXT,           -- A+|A|A-|B+|B|B-|C+|C|C-|D|F
    ADD COLUMN IF NOT EXISTS recommendation     TEXT,           -- Apply|Negotiate|Skip
    ADD COLUMN IF NOT EXISTS application_angle  TEXT,
    ADD COLUMN IF NOT EXISTS summary            TEXT,
    ADD COLUMN IF NOT EXISTS role_fit           NUMERIC,        -- 0.0–5.0
    ADD COLUMN IF NOT EXISTS comp_fit           NUMERIC,
    ADD COLUMN IF NOT EXISTS growth_fit         NUMERIC,
    ADD COLUMN IF NOT EXISTS culture_fit        NUMERIC,
    ADD COLUMN IF NOT EXISTS risk_score         NUMERIC,        -- HIGHER = riskier
    ADD COLUMN IF NOT EXISTS strengths          TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS concerns           TEXT[] NOT NULL DEFAULT '{}';

COMMIT;