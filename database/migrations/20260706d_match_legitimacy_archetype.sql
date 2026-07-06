-- Career-Ops brain update: Block A archetype + Block G legitimacy (2026-07-06).
--
-- Ports the upstream santifer/career-ops evolution into our Matching Brain
-- (llm_ranker): each per-job eval now also classifies the role archetype and
-- runs a text-only legitimacy/ghost-job check (high_confidence | caution |
-- suspicious) — same single LLM call, cost-neutral. These three columns persist
-- the new fields on the match row so every read seam surfaces them.
--
-- Additive + nullable (old rows stay null until re-evaluated). Manual-apply.

ALTER TABLE public.user_job_matches
    ADD COLUMN IF NOT EXISTS archetype          text,
    ADD COLUMN IF NOT EXISTS legitimacy_tier    text,
    ADD COLUMN IF NOT EXISTS legitimacy_reason  text;

COMMENT ON COLUMN public.user_job_matches.legitimacy_tier IS
    'Career Ops Block G: high_confidence | caution | suspicious (ghost/scam signal from JD text).';

NOTIFY pgrst, 'reload schema';
