"""
mentor_retriever — the "librarian", STEP 5 of the Mentor retriever.

Design: docs/DESIGN_mentor_retriever.md §6. ADR-0014 curated layer.

retrieve(query, shelf, k) embeds the query with the pinned model and asks Postgres
for the k nearest authored-playbook passages on that shelf (pgvector cosine, via the
match_playbook_chunks RPC). Returns passages WITH their source for citation.

FAIL-SOFT BY DESIGN: any failure — missing embedding key, RPC error, empty corpus —
returns []. RAG *deepens* a CV rewrite; it is never a hard dependency that can 500
one. The caller (cv_rewrite) falls back to its static rules when nothing comes back.

Reads via the service-role admin client because playbook_chunks has no SELECT policy
(service-read only). The personal layer (CV/JD/skill-gap) stays separate deterministic
SQL per ADR-0014 — this module only touches the curated corpus.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.database import get_supabase_admin
from app.services import embeddings

logger = logging.getLogger(__name__)

# Shelves an authored playbook can belong to (ADR-0013). CV rewrites use "cv".
VALID_SHELVES = {"cv", "interview", "strategy", "pedagogy"}


@dataclass(frozen=True)
class PlaybookPassage:
    chunk_text: str
    source_id: str
    source_title: str
    source_url: str | None
    similarity: float

    def citation(self) -> str:
        """Human label for grounding a rewrite, e.g. 'Myro CV Playbook v1'."""
        return self.source_title


async def retrieve(query: str, shelf: str = "cv", k: int = 3) -> list[PlaybookPassage]:
    """Top-k authored-playbook passages nearest to `query` on `shelf`. [] on any failure."""
    if shelf not in VALID_SHELVES:
        logger.warning("mentor_retriever: unknown shelf %r — no grounding", shelf)
        return []
    if not query or not query.strip():
        return []

    try:
        qvec = await embeddings.embed_query(query)
    except Exception as exc:  # missing key, transient exhaustion, contract violation
        logger.warning("mentor_retriever: embed failed (%s) — falling back to static rules", exc)
        return []

    try:
        resp = (
            get_supabase_admin()
            .rpc(
                "match_playbook_chunks",
                {
                    "query_embedding": embeddings.to_pgvector(qvec),
                    "match_shelf": shelf,
                    "match_count": k,
                },
            )
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:
        logger.warning("mentor_retriever: match query failed (%s) — falling back to static rules", exc)
        return []

    return [
        PlaybookPassage(
            chunk_text=r["chunk_text"],
            source_id=r["source_id"],
            source_title=r["source_title"],
            source_url=r.get("source_url"),
            similarity=float(r.get("similarity") or 0.0),
        )
        for r in rows
    ]
