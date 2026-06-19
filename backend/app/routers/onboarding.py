from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.cv import CVVersionsRepository
from app.repositories.onboarding import OnboardingRepository
from app.services import cv_workflow, onboarding_service
from app.services.baseline_generator import generate_baseline, validate_answer
from app.services.onboarding_preview import start_profile_preview
from app.services.skill_overrides import apply_skill_overrides


router = APIRouter(prefix="/onboarding", tags=["onboarding"])

Seniority = Literal["intern", "entry", "mid", "senior", "lead", "executive", "any"]
ActivationKind = Literal["tailor_credible_job", "review_score_gap", "save_credible_job"]


class FileMetadata(BaseModel):
    name: str = Field(min_length=1, max_length=260)
    mime: str = Field(min_length=1, max_length=180)
    size_bytes: int = Field(ge=0, le=10 * 1024 * 1024)


class ExperienceRequest(BaseModel):
    entry_mode: Literal["uploaded_cv"]
    upload_job_id: str
    file_metadata: FileMetadata


class PreviewRequest(BaseModel):
    description: str = Field(min_length=80, max_length=12_000)


class TargetRequest(BaseModel):
    role_title: str = Field(min_length=2, max_length=120)
    seniority: Seniority
    location: str = Field(min_length=2, max_length=160)


class GeneratorAnswerRequest(BaseModel):
    answer: dict[str, Any]


class DraftRequest(BaseModel):
    draft: str = Field(min_length=80, max_length=30_000)


class SkillOverrideItem(BaseModel):
    skill_id: int = Field(gt=0)
    action: Literal["include", "exclude"]
    evidence_text: str = Field(min_length=5, max_length=2_000)
    source_location: dict[str, Any] = Field(default_factory=dict)


class SkillOverridesRequest(BaseModel):
    overrides: list[SkillOverrideItem] = Field(max_length=100)


class ActivationRequest(BaseModel):
    activation_kind: ActivationKind


@router.get("/state")
def get_state(principal: Principal = Depends(get_principal)) -> dict[str, Any]:
    state = OnboardingRepository(get_supabase_admin()).get_state(principal.id)
    return state or {
        "user_id": principal.id,
        "status": "draft",
        "current_stage": "experience",
        "generator_step": 1,
        "generator_answers": {},
    }


@router.put("/experience", status_code=status.HTTP_204_NO_CONTENT)
def save_experience(
    body: ExperienceRequest,
    principal: Principal = Depends(get_principal),
) -> None:
    OnboardingRepository(get_supabase_admin()).patch_state(
        principal.id,
        {
            "status": "analyzing",
            "current_stage": "target",
            "entry_mode": body.entry_mode,
            "upload_job_id": body.upload_job_id,
            "accepted_file_metadata": body.file_metadata.model_dump(),
        },
    )


@router.post("/profile-preview", status_code=status.HTTP_202_ACCEPTED)
def create_profile_preview(
    body: PreviewRequest,
    principal: Principal = Depends(get_principal),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, str]:
    job_id = start_profile_preview(
        principal.id,
        body.description,
        idempotency_key=idempotency_key,
    )
    return {"status": "processing", "job_id": job_id}


@router.put("/target", status_code=status.HTTP_204_NO_CONTENT)
def save_target(
    body: TargetRequest,
    principal: Principal = Depends(get_principal),
) -> None:
    onboarding_service.save_target(
        get_supabase_admin(),
        principal.id,
        role_title=body.role_title,
        seniority=body.seniority,
        location=body.location,
    )


@router.get("/result")
def get_result(principal: Principal = Depends(get_principal)) -> dict[str, Any]:
    return onboarding_service.get_result(get_supabase_admin(), principal.id)


@router.put("/baseline/answers/{step}", status_code=status.HTTP_204_NO_CONTENT)
def save_generator_answer(
    step: int,
    body: GeneratorAnswerRequest,
    principal: Principal = Depends(get_principal),
) -> None:
    try:
        answer = validate_answer(step, body.answer)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    OnboardingRepository(get_supabase_admin()).save_generator_answer(principal.id, step, answer)


@router.post("/baseline/generate")
def create_baseline_draft(principal: Principal = Depends(get_principal)) -> dict[str, Any]:
    repo = OnboardingRepository(get_supabase_admin())
    state = repo.get_state(principal.id) or {}
    try:
        generated = generate_baseline(state.get("generator_answers") or {})
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    repo.save_generated_draft(principal.id, generated.draft)
    return {"draft": generated.draft, "source_ids": generated.source_ids}


@router.put("/baseline/draft", status_code=status.HTTP_204_NO_CONTENT)
def save_baseline_draft(
    body: DraftRequest,
    principal: Principal = Depends(get_principal),
) -> None:
    OnboardingRepository(get_supabase_admin()).save_generated_draft(principal.id, body.draft.strip())


@router.post("/baseline/approve", status_code=status.HTTP_202_ACCEPTED)
async def approve_baseline(
    body: DraftRequest,
    principal: Principal = Depends(get_principal),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, Any]:
    db = get_supabase_admin()
    repo = OnboardingRepository(db)
    repo.save_generated_draft(principal.id, body.draft.strip())
    result = await cv_workflow.start_cv_upload_job_from_text(
        CVVersionsRepository(db),
        principal.id,
        raw_text=body.draft.strip(),
        idempotency_key=idempotency_key,
        source="generated_baseline",
    )
    repo.patch_state(
        principal.id,
        {
            "status": "analyzing",
            "current_stage": "result",
            "entry_mode": "description",
            "upload_job_id": result.get("job_id"),
        },
    )
    return result


@router.put("/baseline/{baseline_id}/skill-overrides")
def save_skill_overrides(
    baseline_id: int,
    body: SkillOverridesRequest,
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    score = apply_skill_overrides(
        get_supabase_admin(),
        principal.id,
        baseline_id,
        [item.model_dump() for item in body.overrides],
    )
    return {"status": "done", "total_score": float(score["total_score"])}


@router.post("/complete", status_code=status.HTTP_204_NO_CONTENT)
def complete(principal: Principal = Depends(get_principal)) -> None:
    db = get_supabase_admin()
    result = onboarding_service.get_result(db, principal.id)
    if result.get("kind") != "full_result_ready":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Full result is not ready.")
    onboarding_service.mark_completed(db, principal.id)


@router.post("/activate", status_code=status.HTTP_204_NO_CONTENT)
def activate(
    body: ActivationRequest,
    principal: Principal = Depends(get_principal),
) -> None:
    onboarding_service.mark_activated(get_supabase_admin(), principal.id, body.activation_kind)


@router.post("/start-over", status_code=status.HTTP_204_NO_CONTENT)
def start_over(principal: Principal = Depends(get_principal)) -> None:
    repo = OnboardingRepository(get_supabase_admin())
    state = repo.get_state(principal.id) or {}
    if state.get("status") == "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Onboarding is complete.")
    repo.patch_state(
        principal.id,
        {
            "status": "draft",
            "current_stage": "experience",
            "entry_mode": None,
            "upload_job_id": None,
            "accepted_file_metadata": {},
            "description_text": None,
            "preview_payload": None,
            "generator_step": 1,
            "generator_answers": {},
            "generated_draft": None,
        },
    )
