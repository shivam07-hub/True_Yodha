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
