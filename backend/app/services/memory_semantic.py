"""
memory_semantic — "search that knows me" (User Memory Phase 4).

The user's own memory facts, made semantically retrievable. Given what they're
doing right now — a chat message, a search — `retrieve()` returns the facts that
actually matter (pgvector cosine top-k over `user_memory.embedding`, via the
match_user_memory RPC), and `embed_and_store()` populates that embedding once per
fact.

FAIL-SOFT BY DESIGN (mirrors mentor_retriever): any failure — missing embedding
key, unembedded rows, RPC error — returns [] / no-ops. Semantic recall *deepens*
personalization; it is never a hard dependency that can 500 a request. Uses the
admin client + an explicit target_user filter (the RPC also scopes to the user),
so it's safe from background/distiller contexts.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from app.database import get_supabase_admin
from app.services import embeddings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class MemoryHit:
    id: str
    kind: str
    text: str
    similarity: float


async def retrieve(user_id: str, query: str, k: int = 5) -> list[MemoryHit]:
    """The user's active memory facts nearest to `query`. [] on any failure or
    when nothing is embedded yet."""
    if not query or not query.strip():
        return []
    try:
        qvec = await embeddings.embed_query(query)
    except Exception as exc:  # missing key, transient exhaustion, contract violation
        logger.info("memory_semantic: embed failed (%s) — no semantic recall", exc.__class__.__name__)
        return []
    try:
        resp = (
            get_supabase_admin()
            .rpc(
                "match_user_memory",
                {
                    "query_embedding": embeddings.to_pgvector(qvec),
                    "target_user": user_id,
                    "match_count": k,
                },
            )
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:
        logger.info("memory_semantic: match query failed (%s)", exc.__class__.__name__)
        return []
    return [
        MemoryHit(
            id=str(r.get("id") or ""),
            kind=str(r.get("kind") or ""),
            text=str(r.get("text") or ""),
            similarity=float(r.get("similarity") or 0.0),
        )
        for r in rows
        if r.get("text")
    ]


async def embed_and_store(user_id: str, memory_id: str, text: str) -> None:
    """Compute + persist one fact's embedding (best-effort). A failure leaves the
    row's embedding NULL — it simply won't semantic-match until re-embedded."""
    if not memory_id or not (text or "").strip():
        return
    try:
        vec = await embeddings.embed_query(text)
    except Exception as exc:
        logger.info("memory_semantic: embed_and_store embed failed (%s)", exc.__class__.__name__)
        return
    try:
        from app.repositories.user_memory import UserMemoryRepository

        UserMemoryRepository(get_supabase_admin()).set_embedding(
            user_id, memory_id, embeddings.to_pgvector(vec)
        )
    except Exception as exc:  # noqa: BLE001 — best-effort enrichment
        logger.info("memory_semantic: embed_and_store write failed (%s)", exc.__class__.__name__)


def embed_and_store_sync(user_id: str, memory_id: str, text: str) -> None:
    """Sync entry for FastAPI BackgroundTasks (authored writes run off a sync route)."""
    import asyncio

    try:
        asyncio.run(embed_and_store(user_id, memory_id, text))
    except Exception as exc:  # noqa: BLE001 — background best-effort
        logger.info("memory_semantic: background embed failed (%s)", exc.__class__.__name__)
