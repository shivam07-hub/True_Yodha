from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.repositories.cv import CVRepository, get_token_cv_repository
from app.schemas import (
    CVEvidenceSummaryResponse,
    CVGenerateDraftResponse,
    CVSaveDraftRequest,
)
from app.services import cv_builder
from app.services.xp_service import spend_xp

_GENERATE_DRAFT_XP_COST = 50

router = APIRouter()


@router.get("/evidence", response_model=CVEvidenceSummaryResponse)
async def get_cv_evidence(
    current_user: dict = Depends(get_current_user),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
) -> CVEvidenceSummaryResponse:
    return _evidence_stats(cv_repo, current_user["user_id"])


@router.post("/generate-draft", response_model=CVGenerateDraftResponse, status_code=status.HTTP_201_CREATED)
async def generate_next_cv_draft(
    current_user: dict = Depends(get_current_user),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
) -> CVGenerateDraftResponse:
    user_id = current_user["user_id"]
    latest = cv_repo.latest_cv_version(user_id)
    baseline_text = (latest or {}).get("cv_raw_text") or cv_repo.get_cv_raw_text(user_id)
    if not baseline_text:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload a baseline CV first.")

    new_xp_balance = await spend_xp(user_id, _GENERATE_DRAFT_XP_COST, "generate_cv_draft")

    next_version = cv_repo.next_version_number(user_id)
    evidence_rows = _milestones_since(cv_repo, user_id, latest)
    evidence_items = [cv_builder.normalize_evidence({**r, "date": r.get("milestone_date")}) for r in evidence_rows]

    cv_text = cv_builder.build_cv_draft(
        baseline_text=baseline_text,
        evidence_items=evidence_items,
        version_number=next_version,
    )
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "user_id": user_id,
        "skills_count": cv_repo.count_user_skills(user_id),
        "mirror_score": cv_repo.get_current_score(user_id) or 0,
        "uploaded_at": now,
        "cv_raw_text": cv_text,
        "version_number": next_version,
        "version_type": "generated_draft",
        "title": f"Generated CV draft v{next_version}",
        "evidence_snapshot": evidence_items,
        "evidence_count": len(evidence_rows),
    }
    row = cv_repo.insert_cv_history(payload) or cv_repo.latest_cv_version(user_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CV draft was generated but could not be stored.",
        )
    return CVGenerateDraftResponse(
        version_id=row["id"],
        version_number=row.get("version_number") or next_version,
        cv_text=cv_text,
        new_xp_balance=new_xp_balance,
    )


@router.post("/save-draft", response_model=CVGenerateDraftResponse, status_code=status.HTTP_201_CREATED)
async def save_generated_cv_draft(
    body: CVSaveDraftRequest,
    current_user: dict = Depends(get_current_user),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
) -> CVGenerateDraftResponse:
    user_id = current_user["user_id"]
    cv_text = body.cv_text.strip()
    if len(cv_text) < 120:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Draft is too short to save.",
        )

    next_version = cv_repo.next_version_number(user_id)
    latest = cv_repo.latest_cv_version(user_id)
    evidence_rows = _milestones_since(cv_repo, user_id, latest)
    evidence_items = [cv_builder.normalize_evidence({**r, "date": r.get("milestone_date")}) for r in evidence_rows]

    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "user_id": user_id,
        "skills_count": cv_repo.count_user_skills(user_id),
        "mirror_score": cv_repo.get_current_score(user_id) or 0,
        "uploaded_at": now,
        "cv_raw_text": cv_text,
        "version_number": next_version,
        "version_type": "generated_draft",
        "title": f"Generated CV draft v{next_version}",
        "evidence_snapshot": evidence_items,
        "evidence_count": len(evidence_rows),
    }
    row = cv_repo.insert_cv_history(payload) or cv_repo.latest_cv_version(user_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Draft could not be stored.",
        )
    return CVGenerateDraftResponse(
        version_id=row["id"],
        version_number=row.get("version_number") or next_version,
        cv_text=cv_text,
    )


# ── Helpers ──────────────────────────────────────────────────────────────────

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


def _milestones_since(cv_repo: CVRepository, user_id: str, latest: dict | None) -> list[dict]:
    since_dt = _parse_datetime((latest or {}).get("uploaded_at"))
    rows = []
    for row in cv_repo.list_milestones(user_id):
        completed_at = _parse_datetime(row.get("completed_at"))
        if not completed_at:
            continue
        if since_dt and completed_at <= since_dt:
            continue
        rows.append(row)
    rows.sort(key=lambda r: r.get("milestone_date") or "")
    return rows


def _evidence_stats(cv_repo: CVRepository, user_id: str) -> CVEvidenceSummaryResponse:
    latest = cv_repo.latest_cv_version(user_id)
    since_dt = _parse_datetime((latest or {}).get("uploaded_at"))
    since_date = since_dt.date() if since_dt else None

    completed_rows = _milestones_since(cv_repo, user_id, latest)
    evidence_days = {r.get("milestone_date", "")[:10] for r in completed_rows if r.get("milestone_date")}

    diary_entries_count = sum(
        1
        for row in cv_repo.list_diary_log_dates(user_id)
        if (log_date := _parse_date(row.get("log_date"))) and (since_date is None or log_date > since_date)
    )

    skill_upgrades_count = sum(
        1
        for row in cv_repo.list_user_skill_sources(user_id)
        if row.get("source") == "diary"
        and (since_dt is None or ((updated_at := _parse_datetime(row.get("last_updated"))) and updated_at > since_dt))
    )

    current_score = cv_repo.get_current_score(user_id)
    last_cv_score = (latest or {}).get("mirror_score")
    score_delta = (
        float(current_score) - float(last_cv_score)
        if current_score is not None and last_cv_score is not None
        else None
    )

    return CVEvidenceSummaryResponse(
        evidence_count=len(evidence_days),
        diary_entries_count=diary_entries_count,
        skill_upgrades_count=skill_upgrades_count,
        score_delta=score_delta,
        current_score=current_score,
        last_cv_score=last_cv_score,
        next_version_number=cv_repo.next_version_number(user_id),
    )
