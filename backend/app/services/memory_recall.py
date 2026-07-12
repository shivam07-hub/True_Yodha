"""Career Memory recall — ONE read seam over everything Myro remembers.

Four writers-of-record already exist (career_stories, user_memory,
user_connections, cv_dump_entries). This facade is the single place a surface
asks "what does Myro know about this user relevant to X?" so rewrite, intent
chat, interview prep, and the Memory panel all recall the same way:

  - stories:     semantic (embed query → cosine over the user's story vectors,
                 in-Python — personal scale is ≤ a few hundred stories)
  - facts:       semantic via memory_semantic (match_user_memory RPC)
  - connections: deterministic company match (warm intros)

FAIL-SOFT: every leg returns [] on any failure. Recall garnishes a surface;
it must never take one down.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from app.database import get_supabase_admin
from app.repositories.career_reservoir import CareerReservoirRepository
from app.repositories.connections import ConnectionsRepository
from app.services import embeddings, memory_semantic
from app.services.career_reservoir import cosine
from app.services.memory_semantic import MemoryHit

logger = logging.getLogger(__name__)


@dataclass
class StoryHit:
    id: str
    title: str
    pointer: str
    result: str
    skills: list[str]
    similarity: float


@dataclass
class RecallBundle:
    stories: list[StoryHit] = field(default_factory=list)
    facts: list[MemoryHit] = field(default_factory=list)
    connections: list[dict[str, Any]] = field(default_factory=list)


def _parse_vector(raw: Any) -> list[float] | None:
    """PostgREST returns pgvector columns as a '[0.1,0.2,...]' string."""
    import json

    if isinstance(raw, list):
        return [float(x) for x in raw]
    if isinstance(raw, str) and raw.startswith("["):
        try:
            return [float(x) for x in json.loads(raw)]
        except (json.JSONDecodeError, ValueError):
            return None
    return None


async def recall_stories(user_id: str, query: str, k: int = 4) -> list[StoryHit]:
    """The user's active career stories nearest to `query`. [] on any failure
    or when nothing is embedded yet."""
    if not query or not query.strip():
        return []
    try:
        qvec = await embeddings.embed_query(query)
    except Exception as exc:  # missing key, transient exhaustion, contract violation
        logger.info("memory_recall: embed failed (%s) — no story recall", exc.__class__.__name__)
        return []
    try:
        repo = CareerReservoirRepository(get_supabase_admin())
        vec_rows = repo.story_embeddings(user_id)
        if not vec_rows:
            return []
        scored: dict[str, float] = {}
        for row in vec_rows:
            vec = _parse_vector(row.get("embedding"))
            if vec:
                scored[str(row["id"])] = cosine(qvec, vec)
        if not scored:
            return []
        stories = {str(s["id"]): s for s in repo.list_stories(user_id)}
        top = sorted(scored.items(), key=lambda kv: kv[1], reverse=True)[:k]
        hits: list[StoryHit] = []
        for sid, sim in top:
            s = stories.get(sid)
            if not s:
                continue
            narrative = s.get("narrative") or {}
            hits.append(StoryHit(
                id=sid,
                title=s.get("title") or "",
                pointer="",  # canonical pointer joins live in the profile view; grounding uses title+result
                result=narrative.get("result") or "",
                skills=s.get("skills") or [],
                similarity=sim,
            ))
        return hits
    except Exception as exc:  # noqa: BLE001 — recall is garnish, never an outage
        logger.info("memory_recall: story recall failed (%s)", exc.__class__.__name__)
        return []


async def recall(
    user_id: str,
    query: str,
    *,
    k: int = 4,
    company: str | None = None,
) -> RecallBundle:
    """Everything Myro remembers about this user relevant to `query` (+ warm
    connections when a target company is known)."""
    stories = await recall_stories(user_id, query, k=k)
    facts = await memory_semantic.retrieve(user_id, query, k=k)
    connections: list[dict[str, Any]] = []
    if company:
        try:
            connections = ConnectionsRepository(get_supabase_admin()).find_at_company(user_id, company)
        except Exception as exc:  # noqa: BLE001
            logger.info("memory_recall: connections lookup failed (%s)", exc.__class__.__name__)
    return RecallBundle(stories=stories, facts=facts, connections=connections)


def story_grounding_block(hits: list[StoryHit]) -> str:
    """Prompt block: the user's own verified achievements, as truthful raw
    material for a rewrite. Empty string when there is nothing to ground on."""
    lines = []
    for h in hits:
        parts = [h.title]
        if h.result:
            parts.append(f"result: {h.result}")
        if h.skills:
            parts.append(f"skills: {', '.join(h.skills[:5])}")
        lines.append("- " + " — ".join(parts))
    if not lines:
        return ""
    return (
        "THE USER'S OWN CAREER STORIES (verified material from their history — "
        "you may draw truthful specifics from these; NEVER from imagination):\n"
        + "\n".join(lines)
    )
