from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import Principal, get_principal
from app.repositories.scores import ScoresRepository, get_token_scores_repository
from app.schemas import ComputeScoreResponse, GapSkillResponse, MirrorScoreResponse
from app.services import scoring

router = APIRouter(prefix="/scores", tags=["scores"])


@router.get("/me", response_model=MirrorScoreResponse)
async def get_my_score(
    principal: Principal = Depends(get_principal),
    scores_repo: ScoresRepository = Depends(get_token_scores_repository),
) -> MirrorScoreResponse:
    row = scores_repo.get_mirror_score(principal.id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No score found. Upload your CV first.",
        )

    # rank_tier is intentionally excluded from the response
    return MirrorScoreResponse(
        total_score=row["total_score"],
        domain_scores=row.get("domain_scores", {}),
        gap_skills=[GapSkillResponse(**g) for g in row.get("gap_skills", [])],
        skills_assessed=row.get("skills_assessed", 0),
        computed_at=row.get("computed_at", datetime.now(timezone.utc)),
    )


@router.post("/compute", response_model=ComputeScoreResponse)
async def recompute_score(
    principal: Principal = Depends(get_principal),
    scores_repo: ScoresRepository = Depends(get_token_scores_repository),
) -> ComputeScoreResponse:
    """Re-run scoring from existing user_skills. Used after diary updates."""
    inputs = scores_repo.get_recompute_inputs(principal.id)
    if not inputs.skill_level_map:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No skills found. Upload your CV first.",
        )

    score_row = scoring.recompute_score(scores_repo, principal.id)

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
