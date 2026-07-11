from __future__ import annotations

from typing import Any


def hydrate_job_snapshot(row: dict[str, Any]) -> dict[str, Any]:
    """Restore the nested ``jobs`` read shape after raw listing retirement.

    Live job data always wins. A copied snapshot is used only when the jobs row
    has been physically removed, keeping tracker and CV history readable without
    making the retired listing recommendable again.
    """
    if row.get("jobs"):
        return row
    snapshot = row.get("job_snapshot")
    if isinstance(snapshot, dict) and snapshot:
        row["jobs"] = dict(snapshot)
    return row


def attach_jobs(
    rows: list[dict[str, Any]],
    db: Any,
    columns: str,
    *,
    job_id_field: str = "job_id",
) -> list[dict[str, Any]]:
    """Attach a nested ``jobs`` dict to each row via a batched lookup.

    ``job_applications``/``cv_versions`` carry no FK to ``jobs`` (dropped by
    20260711c_job_history_safe_retirement so retired listings can be physically
    deleted without orphaning history) — so PostgREST's embedded-resource
    ``.select("*, jobs(...))")`` can no longer resolve and fails the query
    outright. This does the same "live data always wins, snapshot fallback"
    join in two round-trips instead of relying on that FK.
    """
    job_ids = sorted({row[job_id_field] for row in rows if row.get(job_id_field)})
    jobs_by_id: dict[str, dict[str, Any]] = {}
    if job_ids:
        live = (
            db.table("jobs")
            .select(f"job_id, {columns}")
            .in_("job_id", job_ids)
            .execute()
        ).data or []
        jobs_by_id = {j["job_id"]: {k: v for k, v in j.items() if k != "job_id"} for j in live}
    for row in rows:
        jid = row.get(job_id_field)
        if jid and jid in jobs_by_id:
            row["jobs"] = jobs_by_id[jid]
        hydrate_job_snapshot(row)
    return rows
