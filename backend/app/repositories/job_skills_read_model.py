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
    page_size: int = SUPABASE_PAGE_SIZE,
) -> list[dict[str, Any]]:
    def _query_builder(query: Any) -> Any:
        if only_primary is None:
            return query
        return query.eq("is_primary", only_primary)

    return fetch_all_rows(
        db,
        table="job_skills",
        columns=columns,
        query_builder=_query_builder,
        page_size=page_size,
    )
