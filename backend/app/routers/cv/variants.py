from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.repositories.cv import CVRepository, get_token_cv_repository
from app.schemas import (
    CVEvidenceItem,
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
    return _build_evidence_summary(cv_repo, current_user["user_id"])


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

    # Deduct XP before generation — raises 402 if insufficient
    new_xp_balance = await spend_xp(user_id, _GENERATE_DRAFT_XP_COST, "generate_cv_draft")

    # Include all available evidence regardless of count — XP is the gate now
    summary = _build_evidence_summary(cv_repo, user_id)

    cv_text = cv_builder.build_cv_draft(
        baseline_text=baseline_text,
        evidence_items=[item.model_dump() for item in summary.evidence],
        version_number=summary.next_version_number,
        score_delta=summary.score_delta,
    )
    now = datetime.now(timezone.utc).isoformat()
    draft_score = summary.current_score if summary.current_score is not None else summary.last_cv_score
    payload = {
        "user_id": user_id,
        "skills_count": cv_repo.count_user_skills(user_id),
        "mirror_score": draft_score if draft_score is not None else 0,
        "uploaded_at": now,
        "cv_raw_text": cv_text,
        "version_number": summary.next_version_number,
        "version_type": "generated_draft",
        "title": f"Generated CV draft v{summary.next_version_number}",
        "evidence_snapshot": [item.model_dump() for item in summary.evidence],
        "evidence_count": summary.evidence_count,
    }
    row = cv_repo.insert_cv_history(payload) or cv_repo.latest_cv_version(user_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CV draft was generated but could not be stored.",
        )
    return CVGenerateDraftResponse(
        version_id=row["id"],
        version_number=row.get("version_number") or summary.next_version_number,
        cv_text=cv_text,
        evidence_count=summary.evidence_count,
        score_delta=summary.score_delta,
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
            detail="Draft is too short to save. Generate and review a fuller CV draft.",
        )

    latest = cv_repo.latest_cv_version(user_id)
    baseline_text = (latest or {}).get("cv_raw_text") or cv_repo.get_cv_raw_text(user_id)
    if not baseline_text:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload a baseline CV first.")

    summary = _build_evidence_summary(cv_repo, user_id)
    if not summary.eligible:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Complete {summary.required_count} milestone days before saving the next CV draft.",
        )

    now = datetime.now(timezone.utc).isoformat()
    draft_score = summary.current_score if summary.current_score is not None else summary.last_cv_score
    payload = {
        "user_id": user_id,
        "skills_count": cv_repo.count_user_skills(user_id),
        "mirror_score": draft_score if draft_score is not None else 0,
        "uploaded_at": now,
        "cv_raw_text": cv_text,
        "version_number": summary.next_version_number,
        "version_type": "generated_draft",
        "title": f"Generated CV draft v{summary.next_version_number}",
        "evidence_snapshot": [item.model_dump() for item in summary.evidence],
        "evidence_count": summary.evidence_count,
    }
    row = cv_repo.insert_cv_history(payload) or cv_repo.latest_cv_version(user_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Draft was reviewed but could not be stored.",
        )
    return CVGenerateDraftResponse(
        version_id=row["id"],
        version_number=row.get("version_number") or summary.next_version_number,
        cv_text=cv_text,
        evidence_count=summary.evidence_count,
        score_delta=summary.score_delta,
    )


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


def _build_evidence_summary(cv_repo: CVRepository, user_id: str) -> CVEvidenceSummaryResponse:
    latest = cv_repo.latest_cv_version(user_id)
    since_dt = _parse_datetime((latest or {}).get("uploaded_at"))
    since_date = since_dt.date() if since_dt else None

    completed_rows = []
    for row in cv_repo.list_milestones(user_id):
        completed_at = _parse_datetime(row.get("completed_at"))
        if not completed_at:
            continue
        if since_dt and completed_at <= since_dt:
            continue
        completed_rows.append(row)

    completed_rows.sort(key=lambda item: item.get("milestone_date") or "")
    evidence = [
        CVEvidenceItem(**cv_builder.normalize_evidence({**row, "date": row.get("milestone_date")}))
        for row in completed_rows
    ]
    evidence_days = {item.date for item in evidence if item.date}

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

    missing_prompts = [
        prompt for prompt in (cv_builder.evidence_missing_prompt(item.model_dump()) for item in evidence) if prompt
    ][:3]

    return CVEvidenceSummaryResponse(
        eligible=len(evidence_days) >= cv_builder.REQUIRED_EVIDENCE_DAYS,
        required_count=cv_builder.REQUIRED_EVIDENCE_DAYS,
        evidence_count=len(evidence_days),
        diary_entries_count=diary_entries_count,
        skill_upgrades_count=skill_upgrades_count,
        score_delta=score_delta,
        current_score=current_score,
        last_cv_score=last_cv_score,
        next_version_number=cv_repo.next_version_number(user_id),
        evidence=evidence,
        missing_detail_prompts=missing_prompts,
    )
