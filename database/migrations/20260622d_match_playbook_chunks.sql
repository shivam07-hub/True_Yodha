-- 20260622d_match_playbook_chunks.sql
-- Mentor retriever ("the librarian") — STEP 5 support.
-- Companion to 20260622c_mentor_playbook_chunks.sql. Design: docs/DESIGN_mentor_retriever.md §6.
--
-- pgvector cosine top-k cannot be expressed through PostgREST's query grammar, so
-- the retriever (app/services/mentor_retriever.py) calls this SQL function via RPC.
-- query_embedding is passed as TEXT ('[a,b,c]') and cast to vector inside, which
-- sidesteps PostgREST introspection of the extension type. similarity = 1 - cosine
-- distance (higher = closer). Shelf filter keeps a CV rewrite to CV-shelf passages.
--
-- STABLE + reads service-role only (the table has no SELECT policy); callers use
-- the admin client. Idempotent (CREATE OR REPLACE). Manual run via Supabase dashboard.

BEGIN;

CREATE OR REPLACE FUNCTION match_playbook_chunks(
  query_embedding TEXT,
  match_shelf     TEXT,
  match_count     INT DEFAULT 3
)
RETURNS TABLE (
  id            UUID,
  shelf         TEXT,
  source_id     TEXT,
  source_title  TEXT,
  source_url    TEXT,
  chunk_text    TEXT,
  tags          TEXT[],
  similarity    FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    pc.id,
    pc.shelf,
    pc.source_id,
    pc.source_title,
    pc.source_url,
    pc.chunk_text,
    pc.tags,
    1 - (pc.embedding <=> query_embedding::vector) AS similarity
  FROM playbook_chunks pc
  WHERE pc.shelf = match_shelf
  ORDER BY pc.embedding <=> query_embedding::vector
  LIMIT match_count;
$$;

COMMIT;
