from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.deps import Principal, get_principal
from app.repositories.scores import ScoresRepository, get_token_scores_repository
from app.repositories.users import UsersRepository, get_token_users_repository
from app.routers.users import get_my_skills
from app.schemas import (
    ComputeScoreResponse,
    GapSkillResponse,
    MirrorScoreResponse,
    UserSkillsByDomainResponse,
)
from app.services import scoring
from app.services.concurrent_reads import run_concurrently
from app.services.job_eligibility import target_seniority_for_profile
from app.services.scoring.percentile import top_percent

router = APIRouter(prefix="/scores", tags=["scores"])


class ScoreMapResponse(BaseModel):
    """One latency-bounded read for every input behind the Score map."""

    score: MirrorScoreResponse
    skills: UserSkillsByDomainResponse


def _to_score_response(row: dict, band: str) -> MirrorScoreResponse:
    """Build the API response. rank_tier stays internal; band percentile ships."""
    rank = row.get("percentile")
    return MirrorScoreResponse(
        total_score=row["total_score"],
        domain_scores=row.get("domain_scores", {}),
        gap_skills=[GapSkillResponse(**g) for g in row.get("gap_skills", [])],
        skills_assessed=row.get("skills_assessed", 0),
        computed_at=row.get("computed_at", datetime.now(timezone.utc)),
        band=band,
        band_percentile=rank,
        top_percent=top_percent(rank) if rank is not None else None,
    )


@router.get("/me", response_model=MirrorScoreResponse)
def get_my_score(
    principal: Principal = Depends(get_principal),
    scores_repo: ScoresRepository = Depends(get_token_scores_repository),
) -> MirrorScoreResponse:
    row = scores_repo.get_mirror_score(principal.id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No score found. Upload your CV first.",
        )
    band = target_seniority_for_profile({"target_seniority": scores_repo.get_target_seniority(principal.id)})
    return _to_score_response(row, band)


@router.get("/map", response_model=ScoreMapResponse)
def get_score_map(
    principal: Principal = Depends(get_principal),
    scores_repo: ScoresRepository = Depends(get_token_scores_repository),
    users_repo: UsersRepository = Depends(get_token_users_repository),
) -> ScoreMapResponse:
    """Compose canonical score and CV evidence concurrently.

    The individual endpoints remain the sources of truth and the client falls
    back to them if this optimisation fails. Server-side fan-out replaces two
    browser round-trips with one whose wall time is bounded by the slowest read.
    """
    sections = {
        "score": lambda: get_my_score(principal=principal, scores_repo=scores_repo),
        "skills": lambda: get_my_skills(principal=principal, users_repo=users_repo),
    }
    return ScoreMapResponse(**run_concurrently(sections))


@router.post("/compute", response_model=ComputeScoreResponse)
def recompute_score(
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
    band = target_seniority_for_profile({"target_seniority": inputs.target_seniority})
    score_response = _to_score_response(score_row, band)
    return ComputeScoreResponse(
        score=score_response,
        skills_updated=score_row.get("skills_assessed", 0),
    )
