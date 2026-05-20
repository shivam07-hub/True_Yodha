"""POST /cv/skill-edit — inline skill-driven baseline edits.

Backlog #16 follow-up. SE1–SE17 in CLAUDE.md.

Flow:
    1. Look up the user's skill row to recover its evidence_text.
    2. Locate the matching bullet inside the latest baseline's cv_structured
       (SE2 = A+C). On >1 verbatim match return 409 with the candidate list
       so the frontend can render a picker.
    3. Apply the edit, render new body_text, persist a new baseline_upload
       row titled "Master CV · skill edit · {Skill}" (SE1, SE8).
    4. Sync-diff user_skills against the rewritten body_text (SE3).
    5. Schedule a background task to LLM-retag + recompute_score and stamp
       recompute_finished_at (SE17).
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.repositories.cv import (
    CVVersionWriteSpec,
    CVVersionsRepository,
    get_token_cv_repository,
)
from app.repositories.scores import ScoresRepository, get_token_scores_repository
from app.services import cv_compose, cv_skill_edit

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────


class SkillEditRequest(BaseModel):
    skill_key:     str = Field(..., description="Lightcast taxonomy_key from /users/me/skills")
    new_text:      str = Field(..., min_length=1)
    # Optional location hints, supplied after a 409 conflict picker round-trip.
    section_hint:  str | None = None
    item_index:    int | None = None
    bullet_index:  int | None = None


class SkillEditCandidate(BaseModel):
    section:       str
    item_index:    int
    bullet_index:  int
    text:          str
    label:         str


class SkillEditConflictDetail(BaseModel):
    code:          str = "multi_match"
    skill_key:     str
    candidates:    list[SkillEditCandidate]


class SkillEditResponse(BaseModel):
    baseline_id:        int
    user_version_number: int
    body_text:          str
    title:              str
    dropped_skill_keys: list[str]
    recompute_pending:  bool = True


class RecomputeStatusResponse(BaseModel):
    baseline_id:           int
    recompute_finished_at: str | None


# ── Endpoint ──────────────────────────────────────────────────────────────────


@router.post("/skill-edit", response_model=SkillEditResponse, status_code=status.HTTP_201_CREATED)
async def skill_edit(
    body: SkillEditRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    scores_repo: ScoresRepository = Depends(get_token_scores_repository),
) -> SkillEditResponse:
    user_id = current_user["user_id"]

    baseline = cv_repo.latest_baseline(user_id)
    if baseline is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload a baseline CV first.")

    structured: dict = baseline.get("cv_structured") or {}
    if not structured:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Baseline CV has no structured payload — re-upload the CV to enable inline edits.",
        )

    skill_row = scores_repo.get_user_skill_for_key(user_id, body.skill_key)
    if skill_row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill not found on your profile.")

    evidence_text = skill_row["evidence_text"] or ""
    display_name = skill_row["display_name"] or body.skill_key

    located = cv_skill_edit.locate_bullet(
        structured,
        evidence_text,
        section_hint=body.section_hint,
        item_index=body.item_index,
        bullet_index=body.bullet_index,
    )

    if located is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Could not find this skill's bullet in your CV. Re-upload the CV or edit on the CV page.",
        )

    if isinstance(located, cv_skill_edit.LocateConflict):
        # 409 + candidates list. Frontend renders picker, retries with hints.
        candidates = [
            SkillEditCandidate(
                section=loc.section,
                item_index=loc.item_index,
                bullet_index=loc.bullet_index,
                text=loc.text,
                label=loc.label,
            )
            for loc in located.candidates
        ]
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=SkillEditConflictDetail(skill_key=body.skill_key, candidates=candidates).model_dump(),
        )

    if located.section not in cv_skill_edit.EDITABLE_SECTIONS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Inline edit is not supported for {located.section!r}. Edit on the CV page.",
        )

    new_structured = cv_skill_edit.apply_bullet_edit(structured, located, body.new_text)
    new_body_text = cv_skill_edit.render_baseline_text(new_structured)

    next_n = cv_repo.next_user_version_number(user_id)
    title = f"Master CV · skill edit · {display_name}"
    spec = CVVersionWriteSpec(
        kind="baseline_upload",
        job_id=None,
        parent_version_id=None,
        body_text=new_body_text,
        cv_structured=new_structured,
        title=title,
        snapshot_hash=cv_compose.item_id("skill_edit", next_n, new_body_text),
        confidence_label="user-edited",
    )
    new_baseline = cv_repo.create(user_id, spec)

    dropped = cv_skill_edit.diff_keyword_skills(scores_repo, user_id, new_body_text)

    background_tasks.add_task(
        cv_skill_edit.run_async_retag,
        cv_repo,
        scores_repo,
        user_id,
        new_baseline["id"],
        new_body_text,
    )

    return SkillEditResponse(
        baseline_id=new_baseline["id"],
        user_version_number=new_baseline.get("user_version_number") or next_n,
        body_text=new_body_text,
        title=title,
        dropped_skill_keys=dropped,
        recompute_pending=True,
    )


@router.get("/skill-edit/recompute-status/{baseline_id}", response_model=RecomputeStatusResponse)
async def recompute_status(
    baseline_id: int,
    current_user: dict = Depends(get_current_user),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> RecomputeStatusResponse:
    """Polled by the Skills page after a skill-edit save so it can stop the
    score-ring shimmer once record_cv_score has finished writing."""
    row = cv_repo.find(baseline_id, current_user["user_id"])
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Baseline not found.")
    return RecomputeStatusResponse(
        baseline_id=baseline_id,
        recompute_finished_at=row.get("recompute_finished_at"),
    )


