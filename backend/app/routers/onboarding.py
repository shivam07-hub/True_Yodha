from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.cv import CVVersionsRepository
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.repositories.onboarding import OnboardingRepository
from app.security import redact_sensitive_text
from app.services import cv_workflow, onboarding_first_role, onboarding_service
from app.services.baseline_generator import generate_baseline, validate_answer
from app.services.skill_overrides import apply_skill_overrides
from app.services.skill_confirmation import confirm_baseline_skills


router = APIRouter(prefix="/onboarding", tags=["onboarding"])

Seniority = Literal["intern", "entry", "mid", "senior", "lead", "executive", "any"]
ActivationKind = Literal["tailor_credible_job", "review_score_gap", "save_credible_job"]
MilestoneKind = Literal["score_gap_reviewed", "credible_job_saved", "tailored_cv_created"]


class FileMetadata(BaseModel):
    name: str = Field(min_length=1, max_length=260)
    mime: str = Field(min_length=1, max_length=180)
    size_bytes: int = Field(ge=0, le=10 * 1024 * 1024)


class ExperienceRequest(BaseModel):
    entry_mode: Literal["uploaded_cv"]
    upload_job_id: str | None = None
    file_metadata: FileMetadata


class TargetRequest(BaseModel):
    # Single role (back-compat) OR a list of 1-5 titles (multi-role chips).
    # `role_titles` wins when present; otherwise `role_title` folds into a list.
    role_title: str | None = Field(default=None, min_length=2, max_length=120)
    role_titles: list[str] | None = Field(default=None, max_length=5)
    role_family: str | None = Field(default=None, min_length=2, max_length=200)
    role_families: list[str] | None = Field(default=None, max_length=5)
    # Optional so a point-of-use "edit role" (issue #145) can change only the
    # role(s); save_target preserves the user's existing seniority/location.
    seniority: Seniority | None = None
    location: str | None = Field(default=None, min_length=2, max_length=160)
    # Plural form. `[]` is a real answer ("Anywhere"), distinct from omitting the
    # field, which means "leave my saved locations alone".
    locations: list[str] | None = Field(default=None, max_length=5)
    # The direction axis this step never asked for. Same omitted-vs-empty rule as
    # locations: `[]` clears, absent preserves. `avoid` is what the matcher must
    # rank away from; `lean` is what it should rank toward. Sentences, not chips —
    # the user is answering "what are you actually after", so the caps are wide
    # enough to hold an answer and short enough to stay one clause.
    avoid: list[str] | None = Field(default=None, max_length=6)
    lean: list[str] | None = Field(default=None, max_length=6)
    # Direction's final CTA only. Point-of-use role edits (Market) share this
    # endpoint and must NOT complete onboarding — that would couple every target
    # write to journey state and raise when a ninja claim is still missing.
    finish_onboarding: bool = False

    @model_validator(mode="after")
    def _require_a_role(self) -> "TargetRequest":
        if not self.role_title and not (self.role_titles and any(t.strip() for t in self.role_titles)):
            raise ValueError("Provide role_title or a non-empty role_titles list.")
        return self


class GeneratorAnswerRequest(BaseModel):
    answer: dict[str, Any]


class DraftRequest(BaseModel):
    draft: str = Field(min_length=80, max_length=30_000)


class SkillOverrideItem(BaseModel):
    """One ruling on one extracted skill.

    Identify the skill by ``taxonomy_key`` (what every skill-bearing payload
    already carries) or by ``skill_id``. The key form exists so a caller does not
    have to pull the whole skill catalog client-side just to translate a name it
    was already given.

    ``evidence_text`` is optional for an exclusion — a user removing a skill owes
    no justification, and requiring one used to reject short receipts like "SQL"
    outright.
    """

    skill_id: int | None = Field(default=None, gt=0)
    taxonomy_key: str | None = Field(default=None, min_length=1, max_length=200)
    action: Literal["include", "exclude"]
    evidence_text: str = Field(default="", max_length=2_000)
    source_location: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _one_identifier(self) -> "SkillOverrideItem":
        if (self.skill_id is None) == (self.taxonomy_key is None):
            raise ValueError("Provide exactly one of skill_id or taxonomy_key.")
        if self.action == "include" and len(self.evidence_text.strip()) < 5:
            raise ValueError("Adding a skill needs the CV evidence for it.")
        return self


class SkillOverridesRequest(BaseModel):
    overrides: list[SkillOverrideItem] = Field(max_length=100)


class ActivationRequest(BaseModel):
    activation_kind: ActivationKind


class FirstRoleRequest(BaseModel):
    job_id: str = Field(min_length=1, max_length=200)


@router.get("/state")
def get_state(principal: Principal = Depends(get_principal)) -> dict[str, Any]:
    """The journey's position plus the facts a screen needs to resume.

    `position` is DERIVED (see `journey_position`) — it is not a column. A user
    with no row at all is simply at `experience`, which falls out of the same
    derivation rather than needing a separate default shape here.
    """
    return onboarding_service.journey_position(get_supabase_admin(), principal.id)


@router.put("/experience", status_code=status.HTTP_204_NO_CONTENT)
def save_experience(
    body: ExperienceRequest,
    principal: Principal = Depends(get_principal),
) -> None:
    OnboardingRepository(get_supabase_admin()).patch_state(
        principal.id,
        {
            "entry_mode": body.entry_mode,
            "upload_job_id": body.upload_job_id,
            "accepted_file_metadata": body.file_metadata.model_dump(),
        },
    )


@router.put("/target", status_code=status.HTTP_204_NO_CONTENT)
def save_target(
    body: TargetRequest,
    principal: Principal = Depends(get_principal),
) -> None:
    db = get_supabase_admin()
    try:
        onboarding_service.save_target(
            db,
            principal.id,
            role_title=body.role_title,
            role_titles=body.role_titles,
            role_family=body.role_family,
            role_families=body.role_families,
            seniority=body.seniority,
            location=body.location,
            locations=body.locations,
            avoid=body.avoid,
            lean=body.lean,
        )
        if body.finish_onboarding:
            onboarding_service.complete_onboarding_after_direction(db, principal.id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.delete("/target", status_code=status.HTTP_204_NO_CONTENT)
def reset_target(principal: Principal = Depends(get_principal)) -> None:
    onboarding_service.reset_target(get_supabase_admin(), principal.id)


class RoleReadiness(BaseModel):
    role: str
    readiness: int | None = None  # 0-100, or null when no market demand resolves


@router.get("/role-readiness", response_model=list[RoleReadiness])
def get_role_readiness(
    principal: Principal = Depends(get_principal),
) -> list[RoleReadiness]:
    """Per-target-role readiness % — the role-specific signal beside the stable,
    CV-intrinsic Myro Score. One entry per human target title (the chips)."""
    return onboarding_service.compute_role_readiness(get_supabase_admin(), principal.id)


@router.get("/result")
def get_result(
    step: int | None = Query(default=None, ge=1, le=3),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    """The step to render. `step` looks BACK at completed ground only — a value
    at or beyond the user's furthest is ignored, so it can never skip work."""
    return onboarding_service.get_result(get_supabase_admin(), principal.id, step=step)


@router.put("/baseline/answers/{step}", status_code=status.HTTP_204_NO_CONTENT)
def save_generator_answer(
    step: int,
    body: GeneratorAnswerRequest,
    principal: Principal = Depends(get_principal),
) -> None:
    try:
        answer = validate_answer(step, body.answer)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=redact_sensitive_text(exc),
        ) from exc
    OnboardingRepository(get_supabase_admin()).save_generator_answer(principal.id, step, answer)


@router.post("/baseline/generate")
def create_baseline_draft(principal: Principal = Depends(get_principal)) -> dict[str, Any]:
    repo = OnboardingRepository(get_supabase_admin())
    state = repo.get_state(principal.id) or {}
    try:
        generated = generate_baseline(state.get("generator_answers") or {})
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=redact_sensitive_text(exc),
        ) from exc
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


@router.post("/baseline/{baseline_id}/confirm-skills")
def confirm_skills(
    baseline_id: int,
    body: SkillOverridesRequest,
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    outcome = confirm_baseline_skills(
        get_supabase_admin(),
        principal.id,
        baseline_id,
        [item.model_dump() for item in body.overrides],
    )
    return {"status": "confirmed", **outcome}


@router.post("/first-role")
def commit_first_role(
    body: FirstRoleRequest,
    principal: Principal = Depends(get_principal),
    jobs_repo: JobsRepository = Depends(get_token_jobs_repository),
) -> dict[str, str]:
    return onboarding_first_role.commit_first_role(
        get_supabase_admin(), jobs_repo, principal.id, body.job_id
    )


@router.post("/activate", status_code=status.HTTP_204_NO_CONTENT)
def activate(
    body: ActivationRequest,
    principal: Principal = Depends(get_principal),
) -> None:
    onboarding_service.mark_activated(get_supabase_admin(), principal.id, body.activation_kind)


@router.post("/milestones/{milestone}", status_code=status.HTTP_204_NO_CONTENT)
def mark_milestone(
    milestone: MilestoneKind,
    principal: Principal = Depends(get_principal),
) -> None:
    OnboardingRepository(get_supabase_admin()).mark_milestone(principal.id, milestone)


@router.post("/checklist/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_checklist(principal: Principal = Depends(get_principal)) -> None:
    OnboardingRepository(get_supabase_admin()).dismiss_checklist(principal.id)


@router.get("/checklist")
def get_checklist(principal: Principal = Depends(get_principal)) -> dict[str, Any]:
    return onboarding_service.get_first_success_checklist(
        get_supabase_admin(), principal.id
    )


@router.post("/start-over", status_code=status.HTTP_204_NO_CONTENT)
def start_over(principal: Principal = Depends(get_principal)) -> None:
    repo = OnboardingRepository(get_supabase_admin())
    state = repo.get_state(principal.id) or {}
    if state.get("completed_at"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Onboarding is complete.")
    repo.patch_state(
        principal.id,
        {
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
