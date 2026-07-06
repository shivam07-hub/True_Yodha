-- Semantic "search that knows me" (User Memory Phase 4).
--
-- Adds the deferred embedding column to user_memory (768-dim, same pinned model as
-- the Mentor retriever — app/services/embeddings.py) + a top-k cosine RPC. This
-- makes the user's own memory semantically retrievable: given what they're doing
-- right now (a chat message, a search), fetch the facts that actually matter.
--
-- pgvector cosine top-k can't be expressed through PostgREST, so callers use the
-- match_user_memory RPC (mirrors match_playbook_chunks). SECURITY INVOKER (default)
-- → token callers see only their own rows via RLS; the explicit target_user filter
-- is the guard for admin callers (the distiller). Manual-apply then NOTIFY pgrst.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.user_memory
    ADD COLUMN IF NOT EXISTS embedding vector(768);

-- HNSW cosine index over the embedded rows only (most start NULL, embedded async).
CREATE INDEX IF NOT EXISTS idx_user_memory_embedding
    ON public.user_memory USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION match_user_memory(
    query_embedding TEXT,
    target_user     UUID,
    match_count     INT DEFAULT 5
)
RETURNS TABLE (
    id         UUID,
    kind       TEXT,
    text       TEXT,
    similarity FLOAT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        m.id,
        m.kind,
        m.text,
        1 - (m.embedding <=> query_embedding::vector) AS similarity
    FROM public.user_memory m
    WHERE m.user_id = target_user
      AND m.status = 'active'
      AND m.embedding IS NOT NULL
    ORDER BY m.embedding <=> query_embedding::vector
    LIMIT match_count;
$$;

COMMENT ON COLUMN public.user_memory.embedding IS
    'User Memory Phase 4 — 768-dim fact embedding (pinned openai/text-embedding-3-small via OpenRouter). Powers semantic "search that knows me". Async-populated; NULL until embedded.';

NOTIFY pgrst, 'reload schema';
