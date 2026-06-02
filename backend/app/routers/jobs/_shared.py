from datetime import date, timedelta
from typing import Any

from app.schemas import ApplicationResponse, CVBadge, JobMatchResponse


def last_monday() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


def _row_batch_week(row: dict, fallback: date) -> date:
    value = row.get("batch_week")
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return fallback


def to_job_match(row: dict, batch_week: date) -> JobMatchResponse:
    job = row.get("jobs") or {}
    return JobMatchResponse(
        id=row["id"],
        job_id=row["job_id"],
        title=job.get("job_title") or "",
        company=job.get("company_name"),
        location=job.get("location"),
        location_city=job.get("location_city"),
        location_country=job.get("location_country"),
        location_mode=job.get("location_mode"),
        location_quality=job.get("location_quality"),
        locations=[c for c in (job.get("locations") or []) if c and c.strip()],
        industry=job.get("industry"),
        remote=False,
        overlap_score=row.get("overlap_score", 0),
        llm_rank=row.get("llm_rank"),
        llm_explanation=row.get("llm_explanation"),
        batch_week=_row_batch_week(row, batch_week),
        source_url=job.get("apply_url"),
        matched_skills=row.get("matched_skills") or [],
        job_description=job.get("job_description"),
        overall_score=row.get("overall_score"),
        grade=row.get("grade"),
        recommendation=row.get("recommendation"),
        application_angle=row.get("application_angle"),
        summary=row.get("summary"),
        role_fit=row.get("role_fit"),
        comp_fit=row.get("comp_fit"),
        growth_fit=row.get("growth_fit"),
        culture_fit=row.get("culture_fit"),
        risk_score=row.get("risk_score"),
        strengths=row.get("strengths") or [],
        concerns=row.get("concerns") or [],
    )


def to_application(row: dict, cv_badge: CVBadge | None = None) -> ApplicationResponse:
    job = row.get("jobs") or {}
    return ApplicationResponse(
        id=row["id"],
        job_id=row["job_id"],
        title=job.get("job_title") or "",
        company=job.get("company_name"),
        job_description=job.get("job_description"),
        status=row["status"],
        source=row.get("source") or "system_match",
        applied_at=row.get("applied_at"),
        response_at=row.get("response_at"),
        checkin_sent_at=row.get("checkin_sent_at"),
        followed_up_at=row.get("followed_up_at"),
        closed_at=row.get("closed_at"),
        offer_received_at=row.get("offer_received_at"),
        notes=row.get("notes"),
        created_at=row["created_at"],
        last_stage_changed_at=row.get("last_stage_changed_at"),
        cv_badge=cv_badge,
    )


def cv_badge_from_row(row: dict[str, Any] | None) -> CVBadge | None:
    """Project a cv_versions row → CVBadge. Returns None when there's no thread head."""
    if not row:
        return None
    kind = row.get("kind") or "deterministic"
    return CVBadge(
        version_id=int(row["id"]),
        version_number=int(row.get("user_version_number") or 0),
        kind=kind,
        polished=kind in {"polished", "edited"},
    )
