from datetime import date

from fastapi import APIRouter, Depends, status

import logging

from app.deps import Principal, get_principal
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
from app.services.xp_service import earn_xp
from app.services.xp_policy import DIARY_ENTRY_XP

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/diary", tags=["diary"])

DIARY_XP = DIARY_ENTRY_XP


@router.post("/entry", response_model=DiaryEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_entry(
    body: DiaryEntryRequest,
    principal: Principal = Depends(get_principal),
    diary_repo: DiaryRepository = Depends(get_token_diary_repository),
) -> DiaryEntryResponse:
    user_id = principal.id
    log_date = body.log_date or date.today()
    row, score_before, score_after = progress.record_diary_entry(
        diary_repo=diary_repo,
        user_id=user_id,
        entry_text=body.entry_text,
        log_date=log_date,
        cart_skills=[s.model_dump() for s in body.cart_skills],
    )
    new_balance: int | None = None
    try:
        new_balance = await earn_xp(user_id, DIARY_XP)
    except Exception as exc:
        _log.warning("XP earn failed for diary entry user=%s: %s", user_id, exc)
    return _to_diary_response(row, score_before, score_after, coins_earned=DIARY_XP, new_coin_balance=new_balance)


@router.get("/history", response_model=DiaryHistoryResponse)
def get_diary_history(
    principal: Principal = Depends(get_principal),
    diary_repo: DiaryRepository = Depends(get_token_diary_repository),
    limit: int = 30,
) -> DiaryHistoryResponse:
    entries = [_to_diary_response(row) for row in diary_repo.list_daily_logs(principal.id, limit)]
    return DiaryHistoryResponse(entries=entries, total=len(entries))


@router.get("/milestones", response_model=MilestoneListResponse)
def get_milestones(
    principal: Principal = Depends(get_principal),
    diary_repo: DiaryRepository = Depends(get_token_diary_repository),
    limit: int = 30,
) -> MilestoneListResponse:
    milestones = [
        _to_milestone_response(row)
        for row in progress.list_progress_milestones(diary_repo, principal.id, limit)
    ]
    return MilestoneListResponse(milestones=milestones, total=len(milestones))


@router.put("/milestones", response_model=MilestoneResponse)
def upsert_milestone(
    body: MilestoneRequest,
    principal: Principal = Depends(get_principal),
    diary_repo: DiaryRepository = Depends(get_token_diary_repository),
) -> MilestoneResponse:
    row = progress.upsert_personal_milestone(
        diary_repo=diary_repo,
        user_id=principal.id,
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
    coins_earned: int = 0,
    new_coin_balance: int | None = None,
) -> DiaryEntryResponse:
    deltas = [SkillDeltaItem(**d) for d in (row.get("skills_delta") or [])]
    return DiaryEntryResponse(
        id=row["id"],
        log_date=row["log_date"],
        entry_text=row["entry_text"],
        skills_delta=deltas,
        score_before=score_before,
        score_after=score_after,
        coins_earned=coins_earned,
        new_coin_balance=new_coin_balance,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _to_milestone_response(row: dict) -> MilestoneResponse:
    return MilestoneResponse(
        id=row["id"],
        job_id=row.get("job_id"),
        milestone_date=row["milestone_date"],
        skill=row.get("skill"),
        task=row["task"],
        proof=row.get("proof"),
        impact=row.get("impact"),
        confidence=row.get("confidence") or 0.6,
        completed_at=row.get("completed_at"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        source_type=row.get("source_type", "personal"),
    )
