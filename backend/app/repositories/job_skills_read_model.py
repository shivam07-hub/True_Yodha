from __future__ import annotations

import logging
from typing import Any, Callable

from supabase import Client

# Supabase/PostgREST commonly enforces a 1000-row response cap per request.
# Paginate in 1000-row windows to avoid silent truncation.
SUPABASE_PAGE_SIZE = 1_000

# .in_() serialises each UUID (~36 chars) into the URL query string.
# 200 IDs × 36 chars = ~7 KB, which is at the PostgREST limit.
# RPC is the primary path; chunked .in_() is the fallback.
_IN_CHUNK_SIZE = 200

logger = logging.getLogger(__name__)

_RPC_NAME = "fetch_job_skills_by_job_ids"
_rpc_disabled_for_process = False
_rpc_missing_logged = False


def _is_missing_rpc_signature_error(exc: Exception) -> bool:
    message = str(exc)
    return "PGRST202" in message or "Could not find the function public.fetch_job_skills_by_job_ids" in message


def fetch_all_rows(
    db: Client,
    *,
    table: str,
    columns: str,
    query_builder: Callable[[Any], Any] | None = None,
    page_size: int = SUPABASE_PAGE_SIZE,
) -> list[dict[str, Any]]:
    if page_size <= 0:
        raise ValueError("page_size must be > 0")

    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        query = db.table(table).select(columns)
        if query_builder is not None:
            query = query_builder(query)
        page = query.range(start, start + page_size - 1).execute().data or []
        rows.extend(page)
        if len(page) < page_size:
            return rows
        start += page_size


def _adapt_rpc_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Translate flat RPC rows {job_id, is_primary, taxonomy_key} → {job_id, is_primary, skills:{taxonomy_key}}."""
    return [
        {
            "job_id": r["job_id"],
            "is_primary": r["is_primary"],
            "skills": {"taxonomy_key": r["taxonomy_key"]},
        }
        for r in rows
    ]


def fetch_job_skill_rows_via_rpc(
    db: Client,
    job_ids: list[str],
) -> list[dict[str, Any]]:
    """Single-round-trip RPC call; body-encoded array avoids PostgREST URL-length limits."""
    if not job_ids:
        return []
    result = db.rpc(_RPC_NAME, {"job_ids": job_ids}).execute()
    return _adapt_rpc_rows(result.data or [])


def fetch_job_skill_rows_for_ids(
    db: Client,
    job_ids: list[str],
    *,
    only_primary: bool | None = None,
    columns: str = "job_id, is_primary, skills(taxonomy_key)",
    page_size: int = SUPABASE_PAGE_SIZE,
    chunk_size: int = _IN_CHUNK_SIZE,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for i in range(0, len(job_ids), chunk_size):
        chunk = job_ids[i : i + chunk_size]

        def _query_builder(query: Any, _chunk: list[str] = chunk) -> Any:
            if only_primary is not None:
                query = query.eq("is_primary", only_primary)
            return query.in_("job_id", _chunk)

        rows.extend(
            fetch_all_rows(
                db,
                table="job_skills",
                columns=columns,
                query_builder=_query_builder,
                page_size=page_size,
            )
        )
    return rows


def fetch_job_skill_rows(
    db: Client,
    *,
    columns: str = "job_id, is_primary, skills(taxonomy_key)",
    only_primary: bool | None = None,
    job_ids: list[str] | None = None,
    page_size: int = SUPABASE_PAGE_SIZE,
) -> list[dict[str, Any]]:
    global _rpc_disabled_for_process, _rpc_missing_logged

    if job_ids is not None and len(job_ids) == 0:
        return []

    # When job_ids are scoped, use RPC to avoid PostgREST URL-length 400s.
    # Fall back to chunked .in_() queries if RPC is unavailable.
    if job_ids is not None:
        if not _rpc_disabled_for_process:
            try:
                return fetch_job_skill_rows_via_rpc(db, job_ids)
            except Exception as exc:
                if _is_missing_rpc_signature_error(exc):
                    _rpc_disabled_for_process = True
                    if not _rpc_missing_logged:
                        logger.warning(
                            "fetch_job_skills RPC unavailable (%s); disabling RPC path and using chunked .in_()",
                            exc,
                        )
                        _rpc_missing_logged = True
                else:
                    logger.warning("fetch_job_skills RPC failed (%s), falling back to chunked .in_()", exc)

        return fetch_job_skill_rows_for_ids(
            db, job_ids, only_primary=only_primary, columns=columns, page_size=page_size
        )

    def _query_builder(query: Any) -> Any:
        if only_primary is not None:
            query = query.eq("is_primary", only_primary)
        return query

    return fetch_all_rows(
        db,
        table="job_skills",
        columns=columns,
        query_builder=_query_builder,
        page_size=page_size,
    )


def group_job_skill_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse job_skills JOIN skills rows into [{main_skills:[...], side_skills:[...]}] per job."""
    job_map: dict[str, dict[str, list[str]]] = {}
    for row in rows:
        key = ((row.get("skills") or {}).get("taxonomy_key") or "").strip()
        if not key:
            continue
        jid = row["job_id"]
        if jid not in job_map:
            job_map[jid] = {"main_skills": [], "side_skills": []}
        if row.get("is_primary"):
            job_map[jid]["main_skills"].append(key)
        else:
            job_map[jid]["side_skills"].append(key)
    return list(job_map.values())
