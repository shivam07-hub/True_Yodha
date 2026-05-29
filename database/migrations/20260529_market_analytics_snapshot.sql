-- Market analytics snapshot — single-row materialised payload table.
--
-- Read path: /jobs/analytics SELECTs the JSONB payload from this row instead of
-- scanning the full jobs table per request. Write path: scraper finalisation
-- POSTs to /jobs/analytics/refresh-snapshot which runs the existing compiler
-- and UPSERTs id=1.
--
-- Why a table and not a true MATERIALIZED VIEW: the compiler runs in Python
-- (industry normalization, location hydration, velocity binning) and is not
-- expressible as a single SQL query. Storing the compiled JSON keeps the read
-- path bounded and lets the writer remain in app code.

CREATE TABLE IF NOT EXISTS public.market_analytics_snapshot (
    id              integer PRIMARY KEY DEFAULT 1,
    payload         jsonb NOT NULL,
    refreshed_at    timestamptz NOT NULL DEFAULT now(),
    refreshed_by    text NOT NULL DEFAULT 'system',
    CONSTRAINT market_analytics_snapshot_singleton CHECK (id = 1)
);

-- Trigram GIN index on job_title for ⌘K global search. Mirrors the existing
-- idx_jobs_company_name_trgm precedent. Empty / missing titles are safely
-- excluded by the WHERE clause.
CREATE INDEX IF NOT EXISTS idx_jobs_job_title_trgm
    ON public.jobs
    USING GIN ((COALESCE(job_title, '')) gin_trgm_ops);

NOTIFY pgrst, 'reload schema';
