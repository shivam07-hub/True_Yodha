from datetime import date, timedelta

from app.schemas import ActionPlanDay, ApplicationResponse, JobMatchResponse


def last_monday() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


def to_job_match(row: dict, batch_week: date) -> JobMatchResponse:
    job = row.get("jobs") or {}
    action_plan = [ActionPlanDay(**day) for day in (row.get("action_plan") or [])]
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
        industry=job.get("industry"),
        remote=False,
        overlap_score=row.get("overlap_score", 0),
        llm_rank=row.get("llm_rank"),
        llm_explanation=row.get("llm_explanation"),
        action_plan=action_plan,
        batch_week=batch_week,
        source_url=job.get("apply_url"),
        matched_skills=row.get("matched_skills") or [],
        job_description=job.get("job_description"),
    )


def to_application(row: dict) -> ApplicationResponse:
    job = row.get("jobs") or {}
    return ApplicationResponse(
        id=row["id"],
        job_id=row["job_id"],
        title=job.get("job_title") or "",
        company=job.get("company_name"),
        job_description=job.get("job_description"),
        status=row["status"],
        applied_at=row.get("applied_at"),
        response_at=row.get("response_at"),
        checkin_sent_at=row.get("checkin_sent_at"),
        followed_up_at=row.get("followed_up_at"),
        closed_at=row.get("closed_at"),
        offer_received_at=row.get("offer_received_at"),
        notes=row.get("notes"),
        created_at=row["created_at"],
    )
