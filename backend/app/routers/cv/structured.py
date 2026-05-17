from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.deps import get_current_user
from app.repositories.cv import CVRepository, get_token_cv_repository
from app.services import cv_workflow

router = APIRouter()


class EducationItem(BaseModel):
    institution: str
    degree:      str
    dates:       str
    grade:       str = ""
    location:    str = ""


class ExperienceItem(BaseModel):
    company:  str
    role:     str
    dates:    str
    location: str = ""
    bullets:  list[str]


class ProjectItem(BaseModel):
    name:    str
    dates:   str = ""
    bullets: list[str]


class CVStructuredResponse(BaseModel):
    summary:     str | None
    education:   list[EducationItem]
    experience:  list[ExperienceItem]
    projects:    list[ProjectItem]
    skills_line: str | None
    certs:       list[str]


@router.get("/structured", response_model=CVStructuredResponse)
async def get_cv_structured(
    current_user: dict = Depends(get_current_user),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
) -> CVStructuredResponse:
    """Return latest cv_structured for the user. Lazy backfill on first call if NULL."""
    payload = await cv_workflow.get_or_backfill_cv_structured(cv_repo, current_user["user_id"])
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No baseline CV uploaded. Upload one first.",
        )
    return CVStructuredResponse(**payload)
