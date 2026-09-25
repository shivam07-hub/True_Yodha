"""
semantic_candidates — retrieve job candidates by MEANING, not keyword overlap.

The bypass for the deterministic skill-taxonomy sieve (Delta-4 moat): embed what
the user actually wants (their CV + target roles + remembered preferences) and ask
Postgres for the nearest live jobs (pgvector cosine, match_jobs_semantic RPC). The
Career-Ops brain then judges true fit — a semantically-perfect, keyword-poor role
that the overlap sieve would have dropped now reaches the brain.

WHERE THE VECTORS LIVE — corrected 2026-09-25 against the live database. NOT
`jobs.embedding`: that column was in the original design (migration
`20260711_jobs_semantic_embedding.sql`) and does not exist in production. The
vectors are `private.job_embeddings` (halfvec(768), HNSW), filled by the sister
scraper repo, and `match_jobs_semantic` reads that table. Measured that day:
**43,803 jobs embedded** (`status='complete'`), 269 more enrolled at the
2026-09-17 ingest. The corpus is NOT the reason this module has no caller — see
BACKLOG 7e, which is a cost-and-quality decision, not a wiring chore.

THIS MODULE HAS NO PRODUCTION CALLER YET. `CandidatePool.assemble` is the seam
it unions into (CONTEXT.md "CandidatePool"). Read that before wiring it: the
union widens what reaches the brain, and the brain is the LLM spend.

FAIL-SOFT BY DESIGN: any failure — no embedding key, RPC error, empty corpus —
returns []. The matcher's caller unions this with the deterministic candidate
set, so [] === today's behaviour. Semantic retrieval *widens* the pool; it is
never a hard dependency that can break matching. ⚠️ That same fail-soft is why
the argument names below are load-bearing: a signature mismatch does not raise
to the caller, it returns [] forever, and the feature looks switched on while
retrieving nothing.

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


def _rpc_params(
    qvec: Any, *, countries: list[str] | None, k: int
) -> dict[str, Any]:
    """The deployed `match_jobs_semantic` signature, verified 2026-09-25:

        p_query_embedding text, p_match_count integer, p_target_countries text[],
        p_include_remote boolean, p_excluded_job_ids text[]

    Named because PostgREST resolves a function by its ARGUMENT NAMES: the keys
    this module sent until 2026-09-25 (`query_embedding`, `p_countries`,
    `match_count`) matched no deployed overload, so the call would have failed and
    `retrieve`'s fail-soft `except` would have returned [] on every call, forever.
    Nothing would have raised. `test_semantic_candidates` pins these keys.

    The two defaulted parameters are left to the function (`p_include_remote` true,
    `p_excluded_job_ids` empty): exclusions are the caller's to apply at the
    CandidatePool seam, where the novelty-preference set already lives.
    """
    return {
        "p_query_embedding": embeddings.to_pgvector(qvec),
        "p_match_count": k,
        "p_target_countries": countries or None,
    }


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
            .rpc("match_jobs_semantic", _rpc_params(qvec, countries=countries, k=k))
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:
        logger.info("semantic_candidates: match query failed (%s) — deterministic only", exc)
        return []

    return [str(r["job_id"]) for r in rows if r.get("job_id")]
