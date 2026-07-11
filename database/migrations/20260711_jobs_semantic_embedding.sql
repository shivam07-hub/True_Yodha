-- Semantic job retrieval — "reach the best job regardless of keyword overlap".
--
-- The Delta-4 moat: today every candidate is gated by skill-taxonomy overlap
-- (get_candidate_job_ids_for_skills) BEFORE the Career-Ops brain sees it, so a
-- semantically-perfect but keyword-poor role never enters the brain's view. This
-- adds the vector column + a top-k cosine RPC so the matcher can retrieve
-- candidates by MEANING (the user's CV + intent) and let the brain judge fit.
--
-- Column is populated at SCRAPE time in the sister repo (firecrawl_Supabase),
-- NOT here and NOT per-request — the heavy embed cost is a fixed per-job cost
-- paid once on ingest, so per-refresh cost stays ~1 query embed + 1 indexed
-- search. Same pinned 768-dim model as every other embedding in the stack
-- (app/services/embeddings.py — openai/text-embedding-3-small via OpenRouter).
--
-- Cosine top-k can't be expressed through PostgREST → callers use the RPC
-- (mirrors match_user_memory / match_playbook_chunks). SECURITY INVOKER (default).
-- Fully inert until embeddings land: match_jobs_semantic returns nothing while
-- every jobs.embedding is NULL, so the matcher's fail-soft fallback = today's
-- deterministic behaviour. Manual-apply then NOTIFY pgrst.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS embedding vector(768);

-- HNSW cosine index over the embedded rows only (NULL until the scraper backfills).
CREATE INDEX IF NOT EXISTS idx_jobs_embedding
    ON public.jobs USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL;

-- Nearest jobs by meaning, hard-filtered to what the user can actually take:
-- live listings, optional country constraint (location is a real constraint, not
-- a keyword — a Gurugram user does not want an SF role surfaced by similarity).
-- Freshness/quality is enforced downstream by the recommendable-listing check;
-- here we only gate on is_active so delisted roles never surface.
CREATE OR REPLACE FUNCTION match_jobs_semantic(
    query_embedding TEXT,
    p_countries     TEXT[] DEFAULT NULL,
    match_count     INT DEFAULT 200
)
RETURNS TABLE (
    job_id     UUID,
    similarity FLOAT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        j.id AS job_id,
        1 - (j.embedding <=> query_embedding::vector) AS similarity
    FROM public.jobs j
    WHERE j.embedding IS NOT NULL
      AND j.is_active = TRUE
      AND (
        p_countries IS NULL
        OR array_length(p_countries, 1) IS NULL
        OR j.location_country = ANY(p_countries)
      )
    ORDER BY j.embedding <=> query_embedding::vector
    LIMIT match_count;
$$;

COMMENT ON COLUMN public.jobs.embedding IS
    'Semantic job retrieval — 768-dim job embedding (pinned openai/text-embedding-3-small via OpenRouter), written at scrape time (firecrawl_Supabase). Powers match_jobs_semantic → brain-judged best-fit beyond keyword overlap. NULL until the scraper backfills.';

NOTIFY pgrst, 'reload schema';
