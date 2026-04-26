from datetime import date

from fastapi import APIRouter, Depends, status

from app.deps import get_current_user
from app.repositories.diary import DiaryRepository, get_token_diary_repository
from app.schemas import (
    DiaryEntryRequest,
    DiaryEntryResponse,
    DiaryHistoryResponse,
    MilestoneListResponse,
    MilestoneRequest,
    MilestoneResponse,
    SkillDeltaItem,
)
from app.services import progress

router = APIRouter(prefix="/diary", tags=["diary"])


@router.post("/entry", response_model=DiaryEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_entry(
    body: DiaryEntryRequest,
    current_user: dict = Depends(get_current_user),
    diary_repo: DiaryRepository = Depends(get_token_diary_repository),
) -> DiaryEntryResponse:
    user_id = current_user["user_id"]
    log_date = body.log_date or date.today()
    row, score_before, score_after = progress.record_diary_entry(
        diary_repo=diary_repo,
        user_id=user_id,
        entry_text=body.entry_text,
        log_date=log_date,
    )
    return _to_diary_response(row, score_before, score_after)


@router.get("/history", response_model=DiaryHistoryResponse)
async def get_diary_history(
    current_user: dict = Depends(get_current_user),
    diary_repo: DiaryRepository = Depends(get_token_diary_repository),
    limit: int = 30,
) -> DiaryHistoryResponse:
    entries = [_to_diary_response(row) for row in diary_repo.list_daily_logs(current_user["user_id"], limit)]
    return DiaryHistoryResponse(entries=entries, total=len(entries))


@router.get("/milestones", response_model=MilestoneListResponse)
async def get_milestones(
    current_user: dict = Depends(get_current_user),
    diary_repo: DiaryRepository = Depends(get_token_diary_repository),
    limit: int = 30,
) -> MilestoneListResponse:
    milestones = [
        _to_milestone_response(row)
        for row in progress.list_progress_milestones(diary_repo, current_user["user_id"], limit)
    ]
    return MilestoneListResponse(milestones=milestones, total=len(milestones))


@router.put("/milestones", response_model=MilestoneResponse)
async def upsert_milestone(
    body: MilestoneRequest,
    current_user: dict = Depends(get_current_user),
    diary_repo: DiaryRepository = Depends(get_token_diary_repository),
) -> MilestoneResponse:
    row = progress.upsert_personal_milestone(
        diary_repo=diary_repo,
        user_id=current_user["user_id"],
        milestone_date=body.milestone_date,
        skill=body.skill,
        task=body.task,
        proof=body.proof,
        impact=body.impact,
        confidence=body.confidence,
        completed=body.completed,
    )
    return _to_milestone_response(row)


def _to_diary_response(
    row: dict,
    score_before: float | None = None,
    score_after: float | None = None,
) -> DiaryEntryResponse:
    deltas = [SkillDeltaItem(**d) for d in (row.get("skills_delta") or [])]
    return DiaryEntryResponse(
        id=row["id"],
        log_date=row["log_date"],
        entry_text=row["entry_text"],
        skills_delta=deltas,
        score_before=score_before,
        score_after=score_after,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _to_milestone_response(row: dict) -> MilestoneResponse:
    return MilestoneResponse(
        id=row["id"],
        milestone_date=row["milestone_date"],
        skill=row.get("skill"),
        task=row["task"],
        proof=row.get("proof"),
        impact=row.get("impact"),
        confidence=row.get("confidence") or 0.6,
        completed_at=row.get("completed_at"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
