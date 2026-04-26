from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.deps import get_current_user
from app.repositories.cv import CVRepository, get_token_cv_repository

router = APIRouter()


class CVHistoryItem(BaseModel):
    id: int
    skills_count: int
    mirror_score: float
    uploaded_at: datetime
    cv_raw_text: str | None = None
    version_number: int = 1
    version_type: str = "baseline_upload"
    title: str | None = None
    evidence_count: int = 0


class CVProfileResponse(BaseModel):
    cv_raw_text: str | None
    cv_parsed_at: datetime | None
    history: list[CVHistoryItem]


@router.get("/me", response_model=CVProfileResponse)
async def get_cv_profile(
    current_user: dict = Depends(get_current_user),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
) -> CVProfileResponse:
    profile = cv_repo.get_cv_profile_fields(current_user["user_id"])
    history = cv_repo.list_cv_history(current_user["user_id"])
    return CVProfileResponse(
        cv_raw_text=profile.get("cv_raw_text") if profile else None,
        cv_parsed_at=profile.get("cv_parsed_at") if profile else None,
        history=[_to_cv_history_item(row) for row in history],
    )


def _to_cv_history_item(row: dict) -> CVHistoryItem:
    return CVHistoryItem(
        id=row["id"],
        skills_count=row.get("skills_count") or 0,
        mirror_score=row.get("mirror_score") or 0,
        uploaded_at=row["uploaded_at"],
        cv_raw_text=row.get("cv_raw_text"),
        version_number=row.get("version_number") or 1,
        version_type=row.get("version_type") or "baseline_upload",
        title=row.get("title"),
        evidence_count=row.get("evidence_count") or 0,
    )
