from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.deps import Principal, get_principal
from app.repositories.scores import ScoresRepository, get_scores_repository
from app.repositories.skills import SkillsRepository, get_skills_repository
from app.schemas import SkillResponse, SkillsListResponse
from app.services import skill_state

router = APIRouter(prefix="/skills", tags=["skills"])


class CoreSkillStanding(BaseModel):
    taxonomy_key: str
    level: int
    evidence: str
    required_level: int
    clears: bool


class RoleStandingResponse(BaseModel):
    """`cleared / total` against the core skills of the user's target roles.

    Replaces `/onboarding/role-readiness`, which returned a percentage over
    every skill the market had ever asked for — a denominator no candidate could
    reach, where clearing a whole skill moved the number 0.3%. It also computed
    one value from the union of families and returned it once per title, so a
    user with three targets read the same number three times.

    `total` 0 means "no target set, or no market read" — render nothing. A
    "0 / 12" against a market we never asked about is a verdict on the user.
    """

    cleared: int
    total: int
    core: list[CoreSkillStanding]


@router.get("/role-standing", response_model=RoleStandingResponse)
def get_role_standing(
    principal: Principal = Depends(get_principal),
    scores_repo: ScoresRepository = Depends(get_scores_repository),
) -> RoleStandingResponse:
    """Where the user stands on the skills their target roles actually ask for."""
    standing = skill_state.for_role(
        scores_repo, principal.id, scores_repo.get_target_roles(principal.id)
    )
    return RoleStandingResponse(
        cleared=standing.cleared,
        total=standing.total,
        core=[
            CoreSkillStanding(
                taxonomy_key=s.taxonomy_key,
                level=s.level,
                evidence=s.evidence,
                required_level=s.required_level,
                clears=s.clears,
            )
            for s in standing.core
        ],
    )


@router.get("", response_model=SkillsListResponse)
def list_skills(
    skills_repo: SkillsRepository = Depends(get_skills_repository),
) -> SkillsListResponse:
    skills = [
        SkillResponse(
            id=record.id,
            taxonomy_key=record.taxonomy_key,
            display_name=record.display_name,
            lightcast_id=record.lightcast_id,
            l1_domain=record.l1_domain,
            l2_cluster=record.l2_cluster,
        )
        for record in skills_repo.list_active_skills()
    ]
    return SkillsListResponse(skills=skills, total=len(skills))


@router.get("/domains", response_model=list[str])
def list_domains(
    skills_repo: SkillsRepository = Depends(get_skills_repository),
) -> list[str]:
    """Returns distinct L1 category names present in the skills table."""
    return skills_repo.list_active_domains()
