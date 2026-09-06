"""Which CV went out with an application.

There have always been two ways to apply, and only one of them remembered
anything. The CV builder's Apply button froze a snapshot; marking a job
`applied` in the tracker — the path people actually use — froze nothing. The
result on prod: 67 users have moved a job past `saved` and **3** have an
application attempt on record.

Everything downstream of "which CV did they send" was thin because of it: the
prep room's "CV they have" line, the applied-CV version history, and the ₹99
plan's whole premise that there is a CV worth reading against a job.

The evidence rule is inherited from the builder, which states it exactly right:
*opening an external page is an attempt, never proof that this CV was
submitted.* Only an explicit act of the user's freezes an artifact. Marking a
job `applied` is that act — it is the user saying they did it — so this records
on that transition and on no other.

The two paths do NOT produce equally strong evidence, and the row says which it
is. A builder snapshot is the exact rendered CV the user pressed Apply on. This
one is the CV they had at the moment they said they applied. Both are useful;
conflating them would be the quiet kind of lie.
"""
from __future__ import annotations

import logging
from typing import Any

from app.database import get_supabase_admin

logger = logging.getLogger(__name__)

#: How the row came to exist. The builder path leaves no marker (its rows
#: predate this and are the stronger evidence by construction), so absence means
#: "captured at Apply".
CAPTURE_STATUS_CHANGE = "status_change"


def _pick_version(versions: list[dict[str, Any]], job_id: str) -> dict[str, Any] | None:
    """The CV that went out, best guess, in the order a person would guess it.

    A version tailored for THIS job beats a general one — that is the whole
    point of tailoring, and it mirrors `latestCVVersionForJob` on the client so
    the room and the record cannot disagree about which CV is theirs.

    Baselines are included in the fallback deliberately. 382 users have uploaded
    a CV and 14 have ever edited one, so excluding uploads would record nothing
    for almost everybody and leave this exactly as broken as it was.
    """
    if not versions:
        return None
    for_job = [
        v for v in versions
        if str(v.get("job_id") or "") == job_id and v.get("kind") != "baseline_upload"
    ]
    if for_job:
        return max(for_job, key=lambda v: int(v.get("user_version_number") or 0))
    return max(versions, key=lambda v: (str(v.get("created_at") or ""), int(v.get("id") or 0)))


def _snapshot(version: dict[str, Any], job: dict[str, Any]) -> dict[str, Any]:
    """Mirrors the shape the builder writes, so one history reads both."""
    return {
        "text": version.get("polished_text") or version.get("body_text") or "",
        "title": job.get("job_title") or version.get("title") or "",
        "company": job.get("company_name") or "",
        "structured": version.get("cv_structured") or {},
        "hidden": version.get("hidden_items") or [],
        "captured": CAPTURE_STATUS_CHANGE,
    }


def record_on_apply(user_id: str, job_id: str) -> None:
    """Freeze the CV of record when a user marks a job applied.

    Best-effort and silent. A status change is the user telling us something
    true about their job hunt; failing that write because a CV lookup went wrong
    would be trading the thing they care about for the thing we care about.

    Never overwrites. A submission is a historical fact, and a second row for
    the same job would make the version history claim they applied twice.
    """
    try:
        admin = get_supabase_admin()
        existing = (
            admin.table("cv_application_attempts")
            .select("id")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            return

        versions = (
            admin.table("cv_versions")
            .select(
                "id, job_id, kind, user_version_number, title, cv_structured, "
                "body_text, polished_text, hidden_items, created_at"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
        version = _pick_version(versions, job_id)
        if not version:
            # Applied without ever uploading a CV. Nothing to freeze, and
            # inventing an empty snapshot would put a row in their history that
            # says they applied with nothing.
            return

        job = (
            admin.table("job_applications")
            .select("job_id")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .limit(1)
            .execute()
            .data
            or [{}]
        )[0]

        admin.table("cv_application_attempts").insert(
            {
                "user_id": user_id,
                "job_id": job_id,
                "cv_version_id": version.get("id"),
                "cv_snapshot": _snapshot(version, job),
            }
        ).execute()
        logger.info(
            "metric cv_of_record.captured job=%s version=%s", job_id, version.get("id")
        )
    except Exception as exc:  # noqa: BLE001 — classified: never break a status change
        logger.warning(
            "metric cv_of_record.capture_failed job=%s reason=%s",
            job_id,
            type(exc).__name__,
        )
