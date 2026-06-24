"""POST /cv/{job_id}/gap-plan — plan the gap-driven rewrite session.

Stateless, free, read-only: fetches the job's skill-gap + the user's CV bullets +
practice-proven levels, classifies each `level 0` gap latent/absent with one LLM
call, and returns the honest session plan (surface / Forge / one-notch / upgrade).
Writes nothing — accepts go through the existing /cv/rewrite-bullet[/apply] path.

The thin half of the gap-session epic; all logic lives in services/gap_planner
(pure, fully unit-tested). Spec: memory/project_gap_driven_rewrite_session.md.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.deps import Principal, get_principal
from app.repositories.cv import CVVersionsRepository, get_token_cv_repository
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.services import cv_skill_edit, gap_planner
from app.services.llm_provider import LLMProviderError, get_interactive_provider

router = APIRouter()


# ── Schemas (router-local, mirroring skill_edit's convention) ─────────────────

class GapSkillRef(BaseModel):
    skill: str
    display_name: str


class HostBulletCard(BaseModel):
    order: int
    section: str
    item_index: int
    bullet_index: int
    bullet_text: str
    skills: list[GapSkillRef]


class GapHostBullet(BaseModel):
    section: str
    item_index: int
    bullet_index: int
    bullet_text: str


class BelowLevelCard(BaseModel):
    order: int
    skill: str
    display_name: str
    current_level: int
    required_level: int
    surface_to: int
    is_primary: bool
    host: GapHostBullet | None = None


class AbsentSkill(BaseModel):
    skill: str
    display_name: str
    is_primary: bool
    required_level: int


class UpgradeOffer(BaseModel):
    skill: str
    display_name: str
    from_level: int
    to_level: int
    # Located host bullet when CV evidence exists → the closing panel claims it
    # one-tap; null → no CV evidence yet, the offer routes to practice instead.
    host: GapHostBullet | None = None


class GapPlanResponse(BaseModel):
    job_id: str
    job_title: str
    company: str | None
    host_bullet_cards: list[HostBulletCard]
    below_level_cards: list[BelowLevelCard]
    absent_skills: list[AbsentSkill]
    upgrade_offers: list[UpgradeOffer]
    total_actionable: int
    shown: int
    remaining: int


@router.post("/{job_id}/gap-plan", response_model=GapPlanResponse)
async def gap_plan(
    job_id: str,
    principal: Principal = Depends(get_principal),
    jobs_repo: JobsRepository = Depends(get_token_jobs_repository),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> GapPlanResponse:
    user_id = principal.id

    job = jobs_repo.get_job_skills(job_id)
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")

    baseline = cv_repo.latest_baseline(user_id)
    if baseline is None or not (baseline.get("cv_structured") or {}):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Upload a CV with structured content first to plan gap fixes.",
        )

    gap_items = gap_planner.build_gap_items(
        job.get("skills") or [], jobs_repo.get_user_skill_map(user_id)
    )
    bullets = cv_skill_edit.surfaceable_bullets(baseline["cv_structured"])
    context = jobs_repo.get_gap_skill_context(
        user_id, [g["skill"] for g in gap_items if g["missing"]]
    )
    display_names = {k: v["display_name"] for k, v in context.items()}
    assessed_levels = {k: v["assessed_level"] for k, v in context.items()}

    # Every missing gap is run through host-finding: a level-0 gap with a host is
    # latent (else absent); a below-level gap with a host can offer the one-notch
    # surface. Classification is skipped only when there are no bullets to host onto.
    surfaceable = [
        {"skill": g["skill"], "display_name": display_names.get(g["skill"], g["skill"])}
        for g in gap_items
        if g["missing"]
    ]
    classification: dict[str, tuple[str, int | None]] = {}
    if surfaceable and bullets:
        messages = gap_planner.build_classify_messages(surfaceable, bullets)
        try:
            # Interactive fast lane (Groq direct ~1.5s): the user is staring at the
            # "Mentor is reading your gaps…" spinner. The free OR ladder's
            # rate-limit retries push this past the client's 15s abort → the
            # "Couldn't read your gaps" flake. Fail-safe below still covers a total
            # provider outage (→ every gap classified absent, never fabricated).
            raw = await get_interactive_provider().complete(messages, max_tokens=800)
        except LLMProviderError:
            raw = None  # fail-safe: parse_classification → all absent (never fabricate)
        classification = gap_planner.parse_classification(
            raw, valid_skills={s["skill"] for s in surfaceable}, n_bullets=len(bullets)
        )

    plan = gap_planner.assemble_plan(
        gap_items=gap_items,
        bullets=bullets,
        classification=classification,
        assessed_levels=assessed_levels,
        display_names=display_names,
    )
    return GapPlanResponse(
        job_id=job_id,
        job_title=job.get("job_title") or "",
        company=job.get("company_name"),
        **plan,
    )
