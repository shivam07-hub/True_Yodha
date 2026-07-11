"""
semantic_candidates — retrieve job candidates by MEANING, not keyword overlap.

The bypass for the deterministic skill-taxonomy sieve (Delta-4 moat): embed what
the user actually wants (their CV + target roles + remembered preferences) and ask
Postgres for the nearest live jobs (pgvector cosine, match_jobs_semantic RPC). The
Career-Ops brain then judges true fit — a semantically-perfect, keyword-poor role
that the overlap sieve would have dropped now reaches the brain.

FAIL-SOFT BY DESIGN: any failure — no embedding key, RPC error, or (during rollout)
every jobs.embedding still NULL — returns []. The matcher's caller unions this with
the deterministic candidate set, so [] === today's behaviour. Semantic retrieval
*widens* the pool; it is never a hard dependency that can break matching.

Reads via the service-role admin client (match_jobs_semantic is SECURITY INVOKER;
the matcher already runs admin-side). The location hard-filter lives in the RPC —
location is a real constraint, not a keyword.
"""

from __future__ import annotations

import logging
from typing import Any

from app.database import get_supabase_admin
from app.services import embeddings

logger = logging.getLogger(__name__)

# Bounded so a widened pass never fans the brain triage out past the ceiling. The
# brain's own triage tournament (llm_ranker) narrows this to the deep-eval KEEP.
DEFAULT_K = 200
_MAX_QUERY_CHARS = 6000


def build_query(profile: dict[str, Any]) -> str:
    """The user's intent as one embeddable string: what they're aiming for + who
    they are. Roles/known-facts lead (intent), CV tail grounds it in real skills."""
    parts: list[str] = []
    titles = profile.get("target_role_titles") or (
        [profile["target_role_title"]] if profile.get("target_role_title") else []
    )
    if titles:
        parts.append("Target roles: " + ", ".join(str(t) for t in titles if t))
    known = [f for f in (profile.get("known_facts") or []) if f]
    if known:
        parts.append("Preferences: " + "; ".join(str(k) for k in known))
    cv = (profile.get("cv_markdown") or "").strip()
    if cv:
        parts.append("Background: " + cv)
    return "\n".join(parts)[:_MAX_QUERY_CHARS]


async def retrieve(
    profile: dict[str, Any],
    *,
    countries: list[str] | None = None,
    k: int = DEFAULT_K,
) -> list[str]:
    """Job ids nearest to the user's intent, best-first. [] on any failure."""
    query = build_query(profile)
    if not query.strip():
        return []

    try:
        qvec = await embeddings.embed_query(query)
    except Exception as exc:  # missing key, transient exhaustion, contract violation
        logger.info("semantic_candidates: embed failed (%s) — deterministic only", exc)
        return []

    try:
        resp = (
            get_supabase_admin()
            .rpc(
                "match_jobs_semantic",
                {
                    "query_embedding": embeddings.to_pgvector(qvec),
                    "p_countries": countries or None,
                    "match_count": k,
                },
            )
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:
        logger.info("semantic_candidates: match query failed (%s) — deterministic only", exc)
        return []

    return [str(r["job_id"]) for r in rows if r.get("job_id")]
