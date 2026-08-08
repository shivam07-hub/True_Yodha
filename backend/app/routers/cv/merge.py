"""POST /cv/merge-bullet — combine two near-duplicate CV bullets into one.

A heavy CV dump or repeated edits leave the same win phrased twice inside one
role (or a filler line adding nothing a sibling bullet didn't already say).
Playground bullets could only be hidden or rewritten one at a time — this adds
the third lever: select two bullets in the SAME experience/project item, Mentor
proposes one combined line (no-DELETION guard reused verbatim from rewrite),
the user accepts or discards. Applying writes a new Main-CV baseline, exactly
like /cv/rewrite-bullet/apply — the merge then flows to every tailored copy.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.repositories.cv import CVVersionWriteSpec, CVVersionsRepository, get_token_cv_repository
from app.repositories.scores import ScoresRepository, get_token_scores_repository
from app.services import background, cv_compose, cv_merge, cv_skill_edit
from app.routers.cv.skill_edit import SkillEditCandidate, SkillEditConflictDetail, SkillEditResponse
from app.services.cv_structured_shape import has_content

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────


class MergeBulletRequest(BaseModel):
    bullet_a: str = Field(..., min_length=1)
    bullet_b: str = Field(..., min_length=1)
    role: str | None = None


class MergeBulletResponse(BaseModel):
    mode:        str            # "merge" | "lossy" | "error"
    merged_text: str | None = None
    drops:       list[str] = Field(default_factory=list)  # named facts a lossy merge would drop
    rationale:   str | None = None
    citations:   list[str] = Field(default_factory=list)


class MergeApplyRequest(BaseModel):
    old_text_a:     str = Field(..., min_length=1)
    old_text_b:     str = Field(..., min_length=1)
    merged_text:    str = Field(..., min_length=1)
    section_hint:   str
    item_index:     int
    bullet_index_a: int
    bullet_index_b: int


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/merge-bullet", response_model=MergeBulletResponse)
async def merge_bullet(
    body: MergeBulletRequest,
    principal: Principal = Depends(get_principal),  # noqa: ARG001 — auth gate
) -> MergeBulletResponse:
    """Propose a combined line for two bullets. Stateless — applies nothing.
    Free, same tier as rewrite (a cleanup, not a paid whole-CV restructure)."""
    result = await cv_merge.suggest_merge(body.bullet_a, body.bullet_b, body.role, user_id=principal.id)
    return MergeBulletResponse(**result)


def _conflict(candidates: list[cv_skill_edit.BulletLocation]) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=SkillEditConflictDetail(
            skill_key="",
            candidates=[
                SkillEditCandidate(
                    section=loc.section, item_index=loc.item_index,
                    bullet_index=loc.bullet_index, text=loc.text, label=loc.label,
                )
                for loc in candidates
            ],
        ).model_dump(),
    )


@router.post("/merge-bullet/apply", response_model=SkillEditResponse, status_code=status.HTTP_201_CREATED)
def merge_bullet_apply(
    body: MergeApplyRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    scores_repo: ScoresRepository = Depends(get_token_scores_repository),
) -> SkillEditResponse:
    """Apply an accepted merge to the Main CV. Locates both bullets by their
    known (section, item_index, bullet_index) — the frontend already resolved
    these from the live structured payload — and collapses them into one."""
    user_id = principal.id

    baseline = cv_repo.latest_baseline(user_id)
    if baseline is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload a baseline CV first.")

    structured: dict = baseline.get("cv_structured") or {}
    if not has_content(structured):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Baseline CV has no structured payload — re-upload the CV to enable edits.",
        )

    if body.bullet_index_a == body.bullet_index_b:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Cannot merge a bullet with itself.")

    located_a = cv_skill_edit.locate_bullet(
        structured, body.old_text_a,
        section_hint=body.section_hint, item_index=body.item_index, bullet_index=body.bullet_index_a,
    )
    located_b = cv_skill_edit.locate_bullet(
        structured, body.old_text_b,
        section_hint=body.section_hint, item_index=body.item_index, bullet_index=body.bullet_index_b,
    )

    for located in (located_a, located_b):
        if located is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Could not find one of these bullets in your CV. Refresh and try again.",
            )
        if isinstance(located, cv_skill_edit.LocateConflict):
            raise _conflict(located.candidates)

    if body.section_hint not in ("exp_bullet", "proj_bullet"):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Merge is not supported for {body.section_hint!r}.",
        )

    new_structured = cv_skill_edit.apply_bullet_merge(structured, located_a, located_b, body.merged_text)
    new_body_text = cv_skill_edit.render_baseline_text(new_structured)

    next_n = cv_repo.next_user_version_number(user_id)
    title = "Master CV · merged 2 lines"
    spec = CVVersionWriteSpec(
        kind="baseline_upload",
        job_id=None,
        parent_version_id=None,
        body_text=new_body_text,
        cv_structured=new_structured,
        title=title,
        snapshot_hash=cv_compose.item_id("merge", next_n, new_body_text),
        confidence_label="user-edited",
    )
    new_baseline = cv_repo.create(user_id, spec)

    dropped = cv_skill_edit.diff_keyword_skills(scores_repo, user_id, new_body_text)

    background.enqueue(
        background.LANE_BULK,
        "skill_retag",
        payload={
            "user_id": user_id,
            "baseline_id": new_baseline["id"],
            "new_body_text": new_body_text,
        },
        correlation_id=str(new_baseline["id"]),
    )

    return SkillEditResponse(
        baseline_id=new_baseline["id"],
        user_version_number=new_baseline.get("user_version_number") or next_n,
        body_text=new_body_text,
        title=title,
        dropped_skill_keys=dropped,
        recompute_pending=True,
    )
