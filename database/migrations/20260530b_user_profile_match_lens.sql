-- 20260530b — Matching Brain: candidate "lens" fields on user_profiles
--
-- Captured in an OPTIONAL onboarding step (skippable) and editable later. Feed the
-- Matching Brain's 5-axis evaluation: deal_breakers → role_fit/risk/Skip verdict;
-- career_goal + superpower → growth_fit + application_angle quality.
-- All nullable so existing profiles and frictionless signup stay valid.
--
-- Plan: docs/MATCHING_BRAIN_CHANGE.md

BEGIN;

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS deal_breakers TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS career_goal   TEXT,
    ADD COLUMN IF NOT EXISTS superpower    TEXT;

COMMIT;