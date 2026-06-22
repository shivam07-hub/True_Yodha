-- 20260622c_mentor_playbook_chunks.sql
-- Mentor retriever ("the librarian") — STEP 1 of 6.
-- Design: docs/DESIGN_mentor_retriever.md. Implements ADR-0014 curated layer.
-- Unblocks backlog #32 (CV rewrite/restructure grounding → live Mentor RAG).
--
-- The curated layer of ADR-0014's hybrid retriever: a pgvector store of authored
-- Myro Playbook passages. WRITTEN offline by scripts/publish_playbook.py (embeds
-- each chunk via the pinned model), READ at request time by the backend retriever
-- (mentor_retriever.retrieve) to ground CV rewrites with citable source passages.
--
--   playbook_chunks — one embedded passage. Service-read only: the backend reads
--                     via the service-role client (bypasses RLS) and injects the
--                     text into the rewrite prompt server-side. Raw passages never
--                     reach a browser; only the resolved citation (source_title)
--                     is surfaced. So NO public/anon SELECT policy on purpose.
--
-- Embedding model is PINNED: vector(768) == Gemini text-embedding-004 (the rented
-- brain, design §3). Query and corpus MUST share one model for cosine to be
-- meaningful — a model change is a dimension change and a full corpus republish.
--
-- New infra is exactly ADR-0014's "pgvector extension + one table".
--
-- Idempotent: safe to re-run (IF NOT EXISTS guards throughout).
-- Manual run via Supabase dashboard per feedback_supabase_migrations_manual.

BEGIN;

-- pgvector. Supabase ships it in the `extensions` schema (on the search_path),
-- so the bare `vector(768)` type resolves without qualification.
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Authored playbook passages (publish-written, service-read) ───────────────
CREATE TABLE IF NOT EXISTS playbook_chunks (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- which shelf this passage belongs to (ADR-0013): 'cv' | 'interview' |
  -- 'strategy' | 'pedagogy'. The retriever filters on this so a CV rewrite only
  -- ever sees CV-shelf passages.
  shelf         TEXT         NOT NULL,
  -- value-FK to the rag-sources manifest source_id (external private repo, so a
  -- plain TEXT label, not a DB foreign key). Drives citation provenance.
  source_id     TEXT         NOT NULL,
  -- denormalized for citation display without a cross-repo lookup at read time.
  source_title  TEXT         NOT NULL,
  -- canonical URL — populated ONLY when the manifest marks the source
  -- redistributable; left NULL for private third-party originals.
  source_url    TEXT,
  chunk_text    TEXT         NOT NULL,
  tags          TEXT[]       NOT NULL DEFAULT '{}',
  token_count   INT,
  -- sha256(chunk_text) — idempotent upsert key for the publish pipeline; the same
  -- passage on the same shelf never enters the store twice.
  content_hash  TEXT         NOT NULL,
  -- PINNED 768-dim == Gemini text-embedding-004. Changing the model changes this
  -- dimension and requires a full re-embed (design §3).
  embedding     vector(768)  NOT NULL,
  published_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (shelf, content_hash)
);

-- Approximate-NN search index for cosine top-k. retrieve() does
-- `ORDER BY embedding <=> $query_vec LIMIT k WHERE shelf = $shelf`.
CREATE INDEX IF NOT EXISTS idx_playbook_chunks_embedding
  ON playbook_chunks USING hnsw (embedding vector_cosine_ops);
-- Shelf filter is applied alongside the vector order.
CREATE INDEX IF NOT EXISTS idx_playbook_chunks_shelf
  ON playbook_chunks (shelf);

-- Service-read only: the backend reads via the service-role client, which bypasses
-- RLS. No SELECT policy is granted to anon/authenticated — raw playbook prose is
-- internal-only; users see the rewrite + its citation, never the corpus.
ALTER TABLE playbook_chunks ENABLE ROW LEVEL SECURITY;
-- (No policy on purpose — only service-role may read or write.)

COMMIT;
