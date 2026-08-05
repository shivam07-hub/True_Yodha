from datetime import date, timedelta
from typing import Any

from app.repositories.jobs import _is_marker_stale, _job_feed_marker_to_iso
from app.schemas import ApplicationResponse, CVBadge, JobMatchResponse, MatchEval


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
    # Parse the user_job_matches eval columns through the typed read model: the
    # matcher's output (overlap + credibility + LLM 5-axis) is validated here, at
    # the single read seam, instead of each field being re-guessed via .get().
    # MatchEval is tolerant (extra ignored), so it never narrows the read.
    ev = MatchEval.model_validate(row)
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
        overlap_score=ev.overlap_score,
        match_score=ev.match_score,
        verdict=ev.verdict,
        is_strong=ev.is_strong,
        llm_rank=ev.llm_rank,
        llm_explanation=ev.llm_explanation,
        batch_week=_row_batch_week(row, batch_week),
        source_url=job.get("apply_url"),
        matched_skills=ev.matched_skills,
        missing_skills=ev.missing_skills,
        job_summary=job.get("job_summary"),
        job_description=job.get("job_description"),
        date_posted=job.get("date_posted"),
        seniority_level=job.get("seniority_level"),
        work_mode=job.get("work_mode"),
        min_years_experience=job.get("min_years_experience"),
        max_years_experience=job.get("max_years_experience"),
        first_seen=_job_feed_marker_to_iso(job.get("first_seen")),
        last_seen_at=_job_feed_marker_to_iso(job.get("last_seen")),
        is_stale=_is_marker_stale(job.get("last_seen")),
        is_active=bool(job.get("is_active", True)),
        overall_score=ev.overall_score,
        grade=ev.grade,
        recommendation=ev.recommendation,
        application_angle=ev.application_angle,
        summary=ev.summary,
        role_fit=ev.role_fit,
        comp_fit=ev.comp_fit,
        growth_fit=ev.growth_fit,
        culture_fit=ev.culture_fit,
        risk_score=ev.risk_score,
        strengths=ev.strengths,
        concerns=ev.concerns,
        archetype=ev.archetype,
        legitimacy_tier=ev.legitimacy_tier,
        legitimacy_reason=ev.legitimacy_reason,
        level_strategy=ev.level_strategy,
        personalization=ev.personalization,
        star_pointers=ev.star_pointers,
        is_recommended=ev.is_recommended,
        baseline_version_id=ev.baseline_version_id,
        target_context_hash=ev.target_context_hash,
        seniority_compatibility=ev.seniority_compatibility,
    )


def to_application(
    row: dict,
    cv_badge: CVBadge | None = None,
    user_skill_keys: set[str] | None = None,
    match_score: int | None = None,
) -> ApplicationResponse:
    job = row.get("jobs") or {}
    # First-class card data. `skills` = the job's skills; `matched`/`missing` split
    # them against the user's CV (lower-cased display-name keys) so the dashboard
    # renders ✓/✗ chips. Without keys (import/status responses) the split is empty
    # but `skills` still flows — the list refetch is what paints the card.
    skills = [s.strip() for s in (job.get("main_skills") or []) if s and s.strip()]
    matched: list[str] = []
    missing: list[str] = []
    if user_skill_keys is not None:
        for s in skills:
            (matched if s.lower() in user_skill_keys else missing).append(s)
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
        collection_snoozed_until=row.get("collection_snoozed_until"),
        collection_attention_level=row.get("collection_attention_level"),
        is_priority=bool(row.get("is_priority", False)),
        priority_marked_at=row.get("priority_marked_at"),
        match_score=match_score,
        cv_badge=cv_badge,
        skills=skills,
        matched_skills=matched,
        missing_skills=missing,
        location=job.get("location"),
        location_city=job.get("location_city"),
        location_country=job.get("location_country"),
        location_mode=job.get("location_mode"),
        locations=[c for c in (job.get("locations") or []) if c and c.strip()],
        job_summary=job.get("job_summary"),
        source_url=job.get("apply_url"),
        date_posted=job.get("date_posted"),
        seniority_level=job.get("seniority_level"),
        work_mode=job.get("work_mode"),
        role_domain=job.get("role_domain"),
        min_years_experience=job.get("min_years_experience"),
        max_years_experience=job.get("max_years_experience"),
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
