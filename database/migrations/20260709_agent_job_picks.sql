-- 20260709_agent_job_picks.sql
-- "Myro Agent Picks" — the editorial layer above the algorithm feed.
--
-- A per-user, curated shortlist hand-vetted by the Career-Ops brain (this is the
-- set a user is told to actually apply to). Deliberately SEPARATE from
-- user_job_matches: that table is the algorithm layer and gets wiped/rewritten on
-- every match recompute, so pinned editorial picks cannot live there — they must
-- survive recompute and only change when we cut a fresh recommendation set (each
-- scrape). No FK to jobs (job_id is text + rows delist/churn; the feed read filters
-- to active jobs at query time — same pattern as user_job_matches.job_id).
--
-- Writes are service-role only (the agent op / admin) — there is no INSERT/UPDATE
-- policy, so token clients can only read their own picks.

CREATE TABLE IF NOT EXISTS public.user_agent_job_picks (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id        text NOT NULL,
    agent_rank    smallint NOT NULL,          -- 1 = top pick; display order
    tier          text,                       -- 'bullseye' | 'strong' | 'reach'
    comment       text NOT NULL,              -- the brain's why-it-fits, shown on the card
    generated_at  timestamptz NOT NULL DEFAULT now(),
    scrape_batch  integer,                    -- feed batch_date this pick set was cut against
    UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_picks_user_rank
    ON public.user_agent_job_picks (user_id, agent_rank);

ALTER TABLE public.user_agent_job_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own agent picks read" ON public.user_agent_job_picks;
CREATE POLICY "own agent picks read"
    ON public.user_agent_job_picks
    FOR SELECT
    USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
