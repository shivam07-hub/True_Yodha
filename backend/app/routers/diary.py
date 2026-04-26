from datetime import date, datetime, timezone

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
from app.services import scoring_engine

router = APIRouter(prefix="/diary", tags=["diary"])


@router.post("/entry", response_model=DiaryEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_entry(
    body: DiaryEntryRequest,
    current_user: dict = Depends(get_current_user),
    diary_repo: DiaryRepository = Depends(get_token_diary_repository),
) -> DiaryEntryResponse:
    user_id = current_user["user_id"]
    log_date = body.log_date or date.today()

    # Score before
    score_before = diary_repo.get_total_score(user_id)

    signals: list[dict] = []

    # Update user_skills if any signals found
    if signals:
        _merge_signals_into_user_skills(diary_repo, user_id, signals)
        score_row = scoring_engine.compute_and_persist_score(diary_repo.client, user_id, signals)
        score_after = score_row["total_score"]
    else:
        score_after = score_before

    # Append to existing entry for the day (never overwrite)
    existing_entry = diary_repo.get_daily_log_for_append(user_id, log_date)
    if existing_entry:
        prior_text = existing_entry.get("entry_text") or ""
        combined_text = prior_text + "\n\n---\n\n" + body.entry_text if prior_text else body.entry_text
        prior_delta = existing_entry.get("skills_delta") or []
    else:
        combined_text = body.entry_text
        prior_delta = []

    skills_delta = prior_delta + [{"taxonomy_key": s["taxonomy_key"], "xp_added": s["xp_awarded"], "evidence": s["evidence"]} for s in signals]
    now = datetime.now(timezone.utc).isoformat()
    diary_repo.upsert_daily_log(
        {
            "user_id": user_id,
            "log_date": str(log_date),
            "entry_text": combined_text,
            "skills_delta": skills_delta,
            "updated_at": now,
        }
    )
    row = diary_repo.get_daily_log(user_id, log_date)
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
        for row in diary_repo.list_user_milestones(current_user["user_id"], limit)
    ]
    return MilestoneListResponse(milestones=milestones, total=len(milestones))


@router.put("/milestones", response_model=MilestoneResponse)
async def upsert_milestone(
    body: MilestoneRequest,
    current_user: dict = Depends(get_current_user),
    diary_repo: DiaryRepository = Depends(get_token_diary_repository),
) -> MilestoneResponse:
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "user_id": current_user["user_id"],
        "milestone_date": str(body.milestone_date),
        "skill": body.skill.strip() if body.skill else None,
        "task": body.task,
        "proof": body.proof.strip() if body.proof else None,
        "impact": body.impact.strip() if body.impact else None,
        "confidence": body.confidence,
        "updated_at": now,
    }
    if body.completed:
        payload["completed_at"] = now

    diary_repo.upsert_user_milestone(payload)
    row = diary_repo.get_user_milestone(current_user["user_id"], body.milestone_date)
    return _to_milestone_response(row)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _merge_signals_into_user_skills(
    diary_repo: DiaryRepository,
    user_id: str,
    signals: list[dict],
) -> None:
    """Only upgrade a skill level — never downgrade from diary entries."""
    from app.services.scoring_engine import infer_level_from_signals

    skill_id_map = diary_repo.skill_ids_by_taxonomy_key()
    current_levels = diary_repo.user_skill_levels_by_skill_id(user_id)

    grouped: dict[str, list[dict]] = {}
    for s in signals:
        grouped.setdefault(s["taxonomy_key"], []).append(s)

    rows = []
    for key, sigs in grouped.items():
        skill_id = skill_id_map.get(key)
        if not skill_id:
            continue
        new_level = infer_level_from_signals(sigs)
        existing_level = current_levels.get(skill_id, 0)
        if new_level > existing_level:
            rows.append({
                "user_id": user_id,
                "skill_id": skill_id,
                "matched_level": new_level,
                "source": "diary",
                "evidence_text": sigs[0]["evidence"],
                "last_updated": datetime.now(timezone.utc).isoformat(),
            })

    if rows:
        diary_repo.upsert_user_skill_rows(rows)


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
