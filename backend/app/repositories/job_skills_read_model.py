from __future__ import annotations

from typing import Any, Callable

from supabase import Client

# Supabase/PostgREST commonly enforces a 1000-row response cap per request.
# Paginate in 1000-row windows to avoid silent truncation.
SUPABASE_PAGE_SIZE = 1_000


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


def fetch_job_skill_rows(
    db: Client,
    *,
    columns: str = "job_id, is_primary, skills(taxonomy_key)",
    only_primary: bool | None = None,
    job_ids: list[str] | None = None,
    page_size: int = SUPABASE_PAGE_SIZE,
) -> list[dict[str, Any]]:
    if job_ids is not None and len(job_ids) == 0:
        return []

    def _query_builder(query: Any) -> Any:
        if only_primary is not None:
            query = query.eq("is_primary", only_primary)
        if job_ids is not None:
            query = query.in_("job_id", job_ids)
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
