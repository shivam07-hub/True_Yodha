"""The recruiter's side of a paid internship hosted on Myro.

She posted one internship. Here she reads who applied: the CV each person
already had on Myro (frozen at the moment they applied — `cv_of_record`), the
Myro Score Myro already shows them, and their skills. She never asks anyone to
upload a new resume.

Every read is gated on ownership: `created_by_user_id` on the hosted row must
be the caller. An applicant's CV leaves Myro only to the person who posted the
job he applied to — and the seeker was told that, under the Apply here button,
before he pressed it.

Her answer (`employer_status`) is written here and nowhere else. It sits beside
the seeker's own record and never touches it: `applied_at` is his Yes, `status`
is his stage, `company_response` is his note.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.services.internships import HOSTED_SELECT, intern_card

EMPLOYER_DECISIONS = {"shortlisted", "passed"}
_TOP_SKILLS = 12


class NotYourPost(LookupError):
    """No hosted post with this id belongs to the caller."""


def _owned_post(db: Any, poster_id: str, job_id: str) -> dict[str, Any]:
    rows = (
        db.table("jobs")
        .select(HOSTED_SELECT)
        .eq("job_id", job_id)
        .eq("listing_venue", "myro")
        .eq("created_by_user_id", poster_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise NotYourPost(job_id)
    return rows[0]


def _sent_applications(db: Any, job_ids: list[str]) -> list[dict[str, Any]]:
    """Applications that were sent (the Yes), never a saved job."""
    if not job_ids:
        return []
    return (
        db.table("job_applications")
        .select("id, user_id, job_id, applied_at, employer_status, employer_status_at")
        .in_("job_id", job_ids)
        .not_.is_("applied_at", "null")
        .order("applied_at", desc=True)
        .execute()
        .data
        or []
    )


def my_posts(db: Any, poster_id: str) -> list[dict[str, Any]]:
    """Her hosted internships, any review state, with how many have applied."""
    rows = (
        db.table("jobs")
        .select(HOSTED_SELECT)
        .eq("created_by_user_id", poster_id)
        .eq("listing_venue", "myro")
        .order("first_seen", desc=True)
        .limit(20)
        .execute()
        .data
        or []
    )
    sent = _sent_applications(db, [str(r["job_id"]) for r in rows])
    counts: dict[str, int] = {}
    for app in sent:
        counts[str(app["job_id"])] = counts.get(str(app["job_id"]), 0) + 1
    now = datetime.now(timezone.utc)
    return [
        {**intern_card(row, now=now), "applicant_count": counts.get(str(row["job_id"]), 0)}
        for row in rows
    ]


def _names(db: Any, user_ids: list[str]) -> dict[str, str]:
    if not user_ids:
        return {}
    rows = db.table("user_profiles").select("id, full_name").in_("id", user_ids).execute().data or []
    return {str(r["id"]): (r.get("full_name") or "").strip() for r in rows}


def applicants(db: Any, poster_id: str, job_id: str) -> list[dict[str, Any]]:
    _owned_post(db, poster_id, job_id)
    sent = _sent_applications(db, [job_id])
    names = _names(db, [str(a["user_id"]) for a in sent])
    return [
        {
            "application_id": int(a["id"]),
            "name": names.get(str(a["user_id"])) or "Applicant",
            "applied_at": a["applied_at"],
            "employer_status": a.get("employer_status"),
        }
        for a in sent
    ]


def _application(db: Any, job_id: str, application_id: int) -> dict[str, Any]:
    rows = (
        db.table("job_applications")
        .select("id, user_id, job_id, applied_at, employer_status, employer_status_at")
        .eq("id", application_id)
        .eq("job_id", job_id)
        .not_.is_("applied_at", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise NotYourPost(job_id)
    return rows[0]


def _set_status(db: Any, application_id: int, state: str, *, only_if_unset: bool) -> dict[str, Any] | None:
    query = (
        db.table("job_applications")
        .update({"employer_status": state, "employer_status_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", application_id)
    )
    if only_if_unset:
        query = query.is_("employer_status", "null")
    rows = query.execute().data or []
    return rows[0] if rows else None


def _frozen_cv(db: Any, user_id: str, job_id: str) -> dict[str, Any] | None:
    rows = (
        db.table("cv_application_attempts")
        .select("cv_snapshot, submitted_at")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .order("submitted_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _score(db: Any, user_id: str) -> float | None:
    rows = db.table("mirror_scores").select("total_score").eq("user_id", user_id).limit(1).execute().data or []
    value = rows[0].get("total_score") if rows else None
    return float(value) if value is not None else None


def _skills(db: Any, user_id: str) -> list[str]:
    rows = (
        db.table("user_skills")
        .select("confidence, skills(display_name)")
        .eq("user_id", user_id)
        .order("confidence", desc=True)
        .limit(_TOP_SKILLS)
        .execute()
        .data
        or []
    )
    names = [((r.get("skills") or {}).get("display_name") or "").strip() for r in rows]
    return [n for n in names if n]


def open_applicant(db: Any, poster_id: str, job_id: str, application_id: int) -> dict[str, Any]:
    """One applicant, as she reads him. Opening is what marks him seen."""
    _owned_post(db, poster_id, job_id)
    app = _application(db, job_id, application_id)
    if app.get("employer_status") is None:
        _set_status(db, application_id, "seen", only_if_unset=True)
        app["employer_status"] = "seen"
    user_id = str(app["user_id"])
    frozen = _frozen_cv(db, user_id, job_id)
    return {
        "application_id": int(app["id"]),
        "name": _names(db, [user_id]).get(user_id) or "Applicant",
        "applied_at": app["applied_at"],
        "employer_status": app["employer_status"],
        "cv": (frozen or {}).get("cv_snapshot"),
        "score": _score(db, user_id),
        "skills": _skills(db, user_id),
    }


def decide(db: Any, poster_id: str, job_id: str, application_id: int, state: str) -> str:
    if state not in EMPLOYER_DECISIONS:
        raise ValueError(f"state must be one of {sorted(EMPLOYER_DECISIONS)}")
    _owned_post(db, poster_id, job_id)
    _application(db, job_id, application_id)
    _set_status(db, application_id, state, only_if_unset=False)
    return state
