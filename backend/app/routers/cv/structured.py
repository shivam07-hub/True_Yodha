from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime

from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.repositories.cv import CVRepository, get_token_cv_repository
from app.services import background, cv_compose, cv_skill_edit, cv_workflow

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


class ContactItem(BaseModel):
    """Identity printed on the CV, intentionally separate from account identity."""

    name:     str = ""
    title:    str = ""
    email:    str = ""
    phone:    str = ""
    location: str = ""
    linkedin: str = ""


class CVStructuredResponse(BaseModel):
    contact:     ContactItem = Field(default_factory=ContactItem)
    summary:     str | None
    education:   list[EducationItem]
    experience:  list[ExperienceItem]
    projects:    list[ProjectItem]
    skills_line: str | None
    certs:       list[str]


class MasterSaveResponse(BaseModel):
    baseline_id:         int
    user_version_number: int
    recompute_pending:   bool = True


class MasterRevisionResponse(BaseModel):
    id:                int
    revision_number:   int
    created_at:        datetime
    cv_structured:     dict


class MasterRevisionListResponse(BaseModel):
    revisions: list[MasterRevisionResponse]


@router.get("/structured", response_model=CVStructuredResponse)
def get_cv_structured(
    principal: Principal = Depends(get_principal),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
) -> CVStructuredResponse:
    """Return stored cv_structured. Durable Answer — never a model."""
    payload = cv_workflow.get_stored_cv_structured(cv_repo, principal.id)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No structured CV stored.",
            headers={"X-Myro-Error-Code": "cv_layout_pending"},
        )
    return CVStructuredResponse(**payload)


@router.put("/master", response_model=MasterSaveResponse)
def save_master_cv(
    body: CVStructuredResponse,
    principal: Principal = Depends(get_principal),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
) -> MasterSaveResponse:
    """Autosave structured edits to the Main CV (master ≡ latest_baseline).

    Cheap mutate — no LLM, no XP (save ≠ score, PR-3 grill Q5). Prior content is
    snapshotted to cv_master_revisions first (non-destructive). An async re-tag
    on the bulk Work Lane recomputes skills + score and stamps
    recompute_finished_at; the client polls the existing SE17 endpoint
    (/cv/skill-edit/recompute-status/{baseline_id}) to clear the score shimmer.
    """
    user_id = principal.id
    structured = body.model_dump()
    new_body_text = cv_skill_edit.render_baseline_text(structured)
    snapshot_hash = cv_compose.item_id(
        "master_edit", cv_repo.next_user_version_number(user_id), new_body_text
    )
    updated = cv_repo.update_master(
        user_id,
        body_text=new_body_text,
        cv_structured=structured,
        snapshot_hash=snapshot_hash,
    )
    baseline_id = int(updated["id"])

    from app.database import get_supabase_admin
    from app.repositories.skill_certificates import SkillCertificates
    SkillCertificates(get_supabase_admin()).stamp_from_structured(
        user_id, list(structured.get("certs") or []), baseline_id
    )

    # ADR-0008 bulk lane — reuses the skill-edit re-tag pipeline (re-scores +
    # stamps recompute_finished_at). Durable via RQ when REDIS_URL is set.
    background.enqueue(
        background.LANE_BULK,
        "skill_retag",
        payload={"user_id": user_id, "baseline_id": baseline_id, "new_body_text": new_body_text},
        correlation_id=str(baseline_id),
    )

    return MasterSaveResponse(
        baseline_id=baseline_id,
        user_version_number=int(updated.get("user_version_number") or 0),
        recompute_pending=True,
    )


@router.get("/master/revisions", response_model=MasterRevisionListResponse)
def list_master_revisions(
    principal: Principal = Depends(get_principal),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
) -> MasterRevisionListResponse:
    rows = cv_repo.list_master_revisions(principal.id)
    return MasterRevisionListResponse(revisions=[MasterRevisionResponse(**row) for row in rows])


@router.post("/master/revisions/{revision_id}/restore", response_model=MasterSaveResponse)
def restore_master_revision(
    revision_id: int,
    principal: Principal = Depends(get_principal),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
) -> MasterSaveResponse:
    revision = cv_repo.find_master_revision(revision_id, principal.id)
    if revision is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Main CV revision not found.")
    structured = CVStructuredResponse(**(revision.get("cv_structured") or {})).model_dump()
    body_text = cv_skill_edit.render_baseline_text(structured)
    updated = cv_repo.update_master(
        principal.id,
        body_text=body_text,
        cv_structured=structured,
        snapshot_hash=cv_compose.item_id("master_restore", revision_id, body_text),
    )
    baseline_id = int(updated["id"])
    background.enqueue(
        background.LANE_BULK,
        "skill_retag",
        payload={"user_id": principal.id, "baseline_id": baseline_id, "new_body_text": body_text},
        correlation_id=str(baseline_id),
    )
    return MasterSaveResponse(
        baseline_id=baseline_id,
        user_version_number=int(updated.get("user_version_number") or 0),
        recompute_pending=True,
    )
