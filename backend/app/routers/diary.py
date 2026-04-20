from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, status

from app.database import get_supabase_admin, get_supabase_for_token
from app.deps import get_current_user
from app.schemas import DiaryEntryRequest, DiaryEntryResponse, DiaryHistoryResponse, SkillDeltaItem
from app.services import scoring_engine
from app.services.diary_processor import extract_skill_signals

router = APIRouter(prefix="/diary", tags=["diary"])


@router.post("/entry", response_model=DiaryEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_entry(
    body: DiaryEntryRequest,
    current_user: dict = Depends(get_current_user),
) -> DiaryEntryResponse:
    db = get_supabase_admin()
    user_id = current_user["user_id"]
    log_date = body.log_date or date.today()

    # Score before
    existing_score = db.table("mirror_scores").select("total_score").eq("user_id", user_id).maybe_single().execute()
    score_before = existing_score.data["total_score"] if existing_score.data else None

    # Fetch market-relevant Lightcast skill names for diary signal extraction
    from app.services.taxonomy_loader import get_market_skills
    taxonomy_keys = get_market_skills(db)

    # Extract skill signals from diary text
    signals = extract_skill_signals(body.entry_text, taxonomy_keys)

    # Update user_skills if any signals found
    if signals:
        _merge_signals_into_user_skills(db, user_id, signals)
        score_row = scoring_engine.compute_and_persist_score(db, user_id, signals)
        score_after = score_row["total_score"]
    else:
        score_after = score_before

    # Upsert diary entry
    skills_delta = [{"taxonomy_key": s["taxonomy_key"], "xp_added": s["xp_awarded"], "evidence": s["evidence"]} for s in signals]
    now = datetime.now(timezone.utc).isoformat()
    db.table("daily_logs").upsert(
        {
            "user_id": user_id,
            "log_date": str(log_date),
            "entry_text": body.entry_text,
            "skills_delta": skills_delta,
            "updated_at": now,
        },
        on_conflict="user_id,log_date",
    ).execute()
    result = (
        db.table("daily_logs")
        .select("*")
        .eq("user_id", user_id)
        .eq("log_date", str(log_date))
        .single()
        .execute()
    )
    row = result.data
    return _to_diary_response(row, score_before, score_after)


@router.get("/history", response_model=DiaryHistoryResponse)
async def get_diary_history(
    current_user: dict = Depends(get_current_user),
    limit: int = 30,
) -> DiaryHistoryResponse:
    result = (
        get_supabase_for_token(current_user["token"])
        .table("daily_logs")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .order("log_date", desc=True)
        .limit(limit)
        .execute()
    )
    entries = [_to_diary_response(row) for row in result.data]
    return DiaryHistoryResponse(entries=entries, total=len(entries))


# ── Helpers ───────────────────────────────────────────────────────────────────

def _merge_signals_into_user_skills(db, user_id: str, signals: list[dict]) -> None:
    """Only upgrade a skill level — never downgrade from diary entries."""
    from app.services.scoring_engine import infer_level_from_signals

    skill_id_result = db.table("skills").select("id, taxonomy_key").execute()
    skill_id_map = {r["taxonomy_key"]: r["id"] for r in skill_id_result.data}

    existing = db.table("user_skills").select("skill_id, matched_level").eq("user_id", user_id).execute()
    current_levels = {r["skill_id"]: r["matched_level"] for r in existing.data}

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
        db.table("user_skills").upsert(rows, on_conflict="user_id,skill_id").execute()


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
