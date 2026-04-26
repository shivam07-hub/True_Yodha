from fastapi import APIRouter, Depends

from app.repositories.skills import SkillsRepository, get_skills_repository
from app.schemas import SkillResponse, SkillsListResponse

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=SkillsListResponse)
async def list_skills(
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
async def list_domains(
    skills_repo: SkillsRepository = Depends(get_skills_repository),
) -> list[str]:
    """Returns distinct L1 category names present in the skills table."""
    return skills_repo.list_active_domains()
