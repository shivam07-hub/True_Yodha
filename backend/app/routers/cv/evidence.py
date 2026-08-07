"""CV evidence summary endpoint.

Surfaces progress since the latest baseline CV upload: milestone proofs logged,
diary entries written, skill upgrades attributed to diary, and Myro Score delta.
Consumed by the home/MissionHeader UI.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends

from app.deps import Principal, get_principal
from app.repositories.cv import CVVersionsRepository, get_token_cv_repository
from app.schemas import CVEvidenceSummaryResponse
from app.services.concurrent_reads import run_concurrently

router = APIRouter()


@router.get("/evidence", response_model=CVEvidenceSummaryResponse)
def get_cv_evidence(
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> CVEvidenceSummaryResponse:
    return _evidence_stats(cv_repo, principal.id)


def _parse_datetime(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_date(value: str | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _milestones_from_rows(raw_rows: list[dict], since_dt: datetime | None) -> list[dict]:
    rows = []
    for row in raw_rows:
        completed_at = _parse_datetime(row.get("completed_at"))
        if not completed_at:
            continue
        if since_dt and completed_at <= since_dt:
            continue
        rows.append(row)
    rows.sort(key=lambda r: r.get("milestone_date") or "")
    return rows


def _evidence_stats(cv_repo: CVVersionsRepository, user_id: str) -> CVEvidenceSummaryResponse:
    # Six independent reads (ARCHITECTURE_READ_PATH.md S4 — this is one of the
    # slow /home/bootstrap sections, 1,249ms measured on prod, matching ~6 ×
    # the ~200ms fixed round-trip overhead this Railway<->Supabase path carries
    # even for trivial queries — the same "sequential round trips, not slow
    # queries" shape S1 left open). Only the FILTERING below needs `baseline`'s
    # result (its since_dt/since_date cutoff); every fetch is independent of
    # every other, so they run concurrently and the filtering — which was
    # already pure Python — runs after, unchanged.
    fetched = run_concurrently(
        {
            "baseline": lambda: cv_repo.latest_baseline(user_id),
            "milestones": lambda: cv_repo.list_milestones(user_id),
            "diary_log_dates": lambda: cv_repo.list_diary_log_dates(user_id),
            "skill_sources": lambda: cv_repo.list_user_skill_sources(user_id),
            "current_score": lambda: cv_repo.get_current_score(user_id),
            "next_version_number": lambda: cv_repo.next_user_version_number(user_id),
        },
        label="cv.evidence",
    )
    baseline = fetched["baseline"]
    since_dt = _parse_datetime((baseline or {}).get("created_at"))
    since_date = since_dt.date() if since_dt else None

    completed_rows = _milestones_from_rows(fetched["milestones"], since_dt)
    evidence_days = {r.get("milestone_date", "")[:10] for r in completed_rows if r.get("milestone_date")}

    diary_entries_count = sum(
        1
        for row in fetched["diary_log_dates"]
        if (log_date := _parse_date(row.get("log_date"))) and (since_date is None or log_date > since_date)
    )

    skill_upgrades_count = sum(
        1
        for row in fetched["skill_sources"]
        if row.get("source") == "diary"
        and (since_dt is None or ((updated_at := _parse_datetime(row.get("last_updated"))) and updated_at > since_dt))
    )

    # Baselines no longer carry their own mirror_score (column dropped with cv_history).
    # The score-delta vs prior baseline lives in mirror_score_history; left null here.
    score_delta = None
    last_cv_score = None

    return CVEvidenceSummaryResponse(
        evidence_count=len(evidence_days),
        diary_entries_count=diary_entries_count,
        skill_upgrades_count=skill_upgrades_count,
        score_delta=score_delta,
        current_score=fetched["current_score"],
        last_cv_score=last_cv_score,
        next_version_number=fetched["next_version_number"],
    )
