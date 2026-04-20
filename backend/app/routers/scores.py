from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_supabase_admin
from app.deps import get_current_user
from app.schemas import ComputeScoreResponse, GapSkillResponse, MirrorScoreResponse
from app.services import scoring_engine
from app.services.scoring_engine import fetch_aspiration_skills

router = APIRouter(prefix="/scores", tags=["scores"])


@router.get("/me", response_model=MirrorScoreResponse)
async def get_my_score(current_user: dict = Depends(get_current_user)) -> MirrorScoreResponse:
    result = (
        get_supabase_admin()
        .table("mirror_scores")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No score found. Upload your CV first.",
        )

    row = result.data
    # rank_tier is intentionally excluded from the response
    return MirrorScoreResponse(
        total_score=row["total_score"],
        domain_scores=row.get("domain_scores", {}),
        gap_skills=[GapSkillResponse(**g) for g in row.get("gap_skills", [])],
        skills_assessed=row.get("skills_assessed", 0),
        computed_at=row.get("computed_at", datetime.now(timezone.utc)),
    )


@router.post("/compute", response_model=ComputeScoreResponse)
async def recompute_score(current_user: dict = Depends(get_current_user)) -> ComputeScoreResponse:
    """Re-run scoring from existing user_skills. Used after diary updates."""
    db = get_supabase_admin()

    user_skills = (
        db.table("user_skills")
        .select("matched_level, evidence_text, skills(taxonomy_key)")
        .eq("user_id", current_user["user_id"])
        .execute()
    )
    if not user_skills.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No skills found. Upload your CV first.",
        )

    # Reconstruct signals from stored user_skills
    signals = [
        {
            "taxonomy_key": row["skills"]["taxonomy_key"],
            "xp_awarded": row["matched_level"] * 150,
            "signal_type": "project",
            "evidence": row.get("evidence_text", ""),
        }
        for row in user_skills.data
        if row.get("skills")
    ]

    profile = db.table("user_profiles").select("target_roles").eq("id", current_user["user_id"]).single().execute()
    target_roles: list[str] = (profile.data or {}).get("target_roles") or []
    aspiration_skills = fetch_aspiration_skills(db, target_roles)

    score_row = scoring_engine.compute_and_persist_score(
        db, current_user["user_id"], signals, aspiration_skills or None
    )

    score_response = MirrorScoreResponse(
        total_score=score_row["total_score"],
        domain_scores=score_row.get("domain_scores", {}),
        gap_skills=[GapSkillResponse(**g) for g in score_row.get("gap_skills", [])],
        skills_assessed=score_row.get("skills_assessed", 0),
        computed_at=score_row.get("computed_at", datetime.now(timezone.utc)),
    )
    return ComputeScoreResponse(
        score=score_response,
        skills_updated=score_row.get("skills_assessed", 0),
    )
