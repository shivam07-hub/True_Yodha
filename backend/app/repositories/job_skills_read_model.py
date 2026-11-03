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

_RPC_NAME = "fetch_job_skills_by_job_ids_v2"
_rpc_disabled_for_process = False
_rpc_missing_logged = False


def _is_missing_rpc_signature_error(exc: Exception) -> bool:
    message = str(exc)
    return "PGRST202" in message or f"Could not find the function public.{_RPC_NAME}" in message


# The unique column a Corpus Read walks. A table not named here walks `id`.
_CORPUS_KEY = {"jobs": "job_id"}


def _top_level_columns(columns: str) -> set[str]:
    names: set[str] = set()
    depth = 0
    token = ""
    for ch in columns + ",":
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            names.add(token.strip())
            token = ""
        else:
            token += ch
    return names


def fetch_all_rows(
    db: Client,
    *,
    table: str,
    columns: str,
    query_builder: Callable[[Any], Any] | None = None,
    page_size: int = SUPABASE_PAGE_SIZE,
) -> list[dict[str, Any]]:
    """Every row the filter matches, walked on the table's unique key.

    Each page asks for the rows after the last key seen, so a page is a short
    index range and no row is read twice. OFFSET paging re-read every earlier
    row on every page: one pass over jobs read the table about 41 times and
    drained the Micro disk IO budget (2026-11-03). Without an order it could
    also skip or repeat rows.

    The walk owns the order: its key is ordered before the caller's builder
    runs, so a caller's `.order()` only breaks ties on a unique key.
    """
    if page_size <= 0:
        raise ValueError("page_size must be > 0")

    key = _CORPUS_KEY.get(table, "id")
    named = _top_level_columns(columns)
    strip_key = key not in named and "*" not in named
    selected = f"{key}, {columns}" if strip_key else columns

    rows: list[dict[str, Any]] = []
    after: Any = None
    while True:
        query = db.table(table).select(selected).order(key)
        if query_builder is not None:
            query = query_builder(query)
        if after is not None:
            query = query.gt(key, after)
        page = query.limit(page_size).execute().data or []
        rows.extend(page)
        if len(page) < page_size:
            break
        after = page[-1][key]

    if strip_key:
        for row in rows:
            row.pop(key, None)
    return rows


def fetch_bounded_rows(
    db: Client,
    *,
    table: str,
    columns: str,
    query_builder: Callable[[Any], Any] | None = None,
    bound: int = SUPABASE_PAGE_SIZE,
) -> list[dict[str, Any]]:
    """One page from a table with no single unique key to walk.

    A full page means the table outgrew the bound. Raise instead of returning
    the first `bound` rows as if they were all of them.
    """
    query = db.table(table).select(columns)
    if query_builder is not None:
        query = query_builder(query)
    rows = query.limit(bound).execute().data or []
    if len(rows) >= bound:
        raise RuntimeError(f"{table} returned {len(rows)} rows, at its bound of {bound}")
    return rows


def _adapt_rpc_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flat RPC rows → the embedded shape the readers expect.

    `required_level` and L3 `practice_mode` ride along because the matcher ranks
    on them: `is_primary` is nearly constant, while the other two decide depth
    and whether Myro can offer an objective ladder for the gap.
    """
    return [
        {
            "job_id": r["job_id"],
            "is_primary": r["is_primary"],
            "required_level": r.get("required_level"),
            "skills": {
                "taxonomy_key": r["taxonomy_key"],
                "practice_mode": r.get("practice_mode"),
                "skill_kind": r.get("skill_kind"),
            },
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
    columns: str = "job_id, is_primary, required_level, skills(taxonomy_key, practice_mode, skill_kind)",
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
    columns: str = "job_id, is_primary, required_level, skills(taxonomy_key, practice_mode, skill_kind)",
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
