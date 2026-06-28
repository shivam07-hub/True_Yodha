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

import asyncio
import logging
import time
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.repositories.cv import (
    CVVersionWriteSpec,
    CVVersionsRepository,
    get_token_cv_repository,
)
from app.repositories.scores import ScoresRepository, get_token_scores_repository
from app.services import background, cv_compose, cv_rewrite, cv_skill_edit, progress_stream, text_stream
from app.services.llm_provider import get_llm_provider

logger = logging.getLogger(__name__)

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


# Per-bullet Mentor rewrite (DESIGN_cv_playground_redesign §6) ──────────────────


class RewriteBulletRequest(BaseModel):
    bullet:           str = Field(..., min_length=1)
    role:             str | None = None
    missing_keywords: list[str] = Field(default_factory=list)
    metric:           str | None = None
    allow_no_metric:  bool = False


class RewriteBulletResponse(BaseModel):
    mode:           str               # "rewrite" | "question" | "error"
    rewritten_text: str | None = None
    question:       str | None = None
    rationale:      str | None = None
    # #32: authored-playbook source titles the rewrite was grounded in (empty when
    # retrieval found nothing / RAG was down — the rewrite still succeeds).
    citations:      list[str] = Field(default_factory=list)


class RewriteApplyRequest(BaseModel):
    old_text:     str = Field(..., min_length=1)
    new_text:     str = Field(..., min_length=1)
    section_hint: str | None = None
    item_index:   int | None = None
    bullet_index: int | None = None


# ── Endpoint ──────────────────────────────────────────────────────────────────


@router.post("/skill-edit", response_model=SkillEditResponse, status_code=status.HTTP_201_CREATED)
def skill_edit(
    body: SkillEditRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    scores_repo: ScoresRepository = Depends(get_token_scores_repository),
) -> SkillEditResponse:
    user_id = principal.id

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

    # ADR-0008 — bulk Work Lane. Durable via RQ when REDIS_URL is set, else the
    # in-process fallback (same as the old BackgroundTasks behaviour).
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


@router.post("/rewrite-bullet", response_model=RewriteBulletResponse)
async def rewrite_bullet(
    body: RewriteBulletRequest,
    principal: Principal = Depends(get_principal),  # noqa: ARG001 — auth gate
) -> RewriteBulletResponse:
    """Propose a stronger rewrite for ONE bullet, or (no-fabrication guard) ask
    for the real metric. Stateless — applies nothing. Free per ADR-0004 (floor-0
    wedge; REWRITE pricing is DEC-H, pending)."""
    result = await cv_rewrite.suggest_rewrite(
        body.bullet,
        body.role,
        body.missing_keywords,
        body.metric,
        get_llm_provider(),
        allow_no_metric=body.allow_no_metric,
    )
    return RewriteBulletResponse(**result)


@router.post("/rewrite-bullet/stream")
async def rewrite_bullet_stream(
    body: RewriteBulletRequest,
    principal: Principal = Depends(get_principal),  # noqa: ARG001 — auth gate
) -> StreamingResponse:
    """Streaming twin of POST /rewrite-bullet (ADR-0009). Types the rewrite out
    token-by-token so the user watches Mentor work instead of staring at a blank
    "rewriting…" spinner. The no-fabrication guard (`question`) and pre-stream
    errors carry no prose to type, so they arrive as a single terminal frame:
        done  {mode:"question", question}
        error {recoverable:false, message}
    A real rewrite streams `token`* then `done {mode:"rewrite", rewritten_text,
    rationale, citations}`. Free + stateless — applies nothing; accepts still go
    through /rewrite-bullet/apply."""
    plan = await cv_rewrite.prepare_rewrite(
        body.bullet, body.role, body.missing_keywords, body.metric,
        allow_no_metric=body.allow_no_metric,
    )
    if plan["mode"] == "question":
        return text_stream.response(
            text_stream.one({"type": "done", "mode": "question", "question": plan["question"]})
        )
    if plan["mode"] == "error":
        return text_stream.response(
            text_stream.one({"type": "error", "recoverable": False, "message": plan["rationale"]})
        )

    passages = plan["passages"]
    missing = plan["missing_keywords"]

    async def finalize(text: str) -> dict:
        result = cv_rewrite.finalize_rewrite(text, passages, missing)
        if result.get("mode") == "error":
            raise text_stream.StreamAbort(result.get("rationale") or "No rewrite produced.", recoverable=True)
        return {
            "mode": "rewrite",
            "rewritten_text": result["rewritten_text"],
            "rationale": result["rationale"],
            "citations": result["citations"],
        }

    return text_stream.response(
        text_stream.live(get_llm_provider(), plan["messages"], max_tokens=cv_rewrite.MAX_TOKENS, finalize=finalize)
    )


# v2 reservoir: only experience/project bullets are points.
_SECTION_TO_LIST = {"exp_bullet": "experience", "proj_bullet": "projects"}


def _mirror_rewrite_to_reservoir(
    cv_repo: CVVersionsRepository,
    user_id: str,
    located: "cv_skill_edit.BulletLocation",
    old_text: str,
    new_text: str,
) -> None:
    """Dual-write the accepted rewrite into the experience reservoir as a new canonical
    phrasing of the point (shadow, best-effort). Never raises — the master write has
    already succeeded; a reservoir hiccup must not fail the user's accept."""
    list_key = _SECTION_TO_LIST.get(located.section)
    if not list_key:
        return
    anchor = f"{list_key}:{located.item_index}"
    try:
        cv_repo.append_phrasing(user_id, anchor, old_text, new_text, source="restructure")
    except Exception:  # noqa: BLE001 — best-effort shadow mirror, never block the accept
        logger.info("reservoir append skipped (best-effort) for user=%s", user_id)


@router.post("/rewrite-bullet/apply", response_model=SkillEditResponse, status_code=status.HTTP_201_CREATED)
def rewrite_bullet_apply(
    body: RewriteApplyRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    scores_repo: ScoresRepository = Depends(get_token_scores_repository),
) -> SkillEditResponse:
    """Apply an accepted rewrite to the Main CV. Locates the bullet by its old
    text (no skill key) and writes a new baseline — mirrors /cv/skill-edit so the
    rewrite flows to every tailored copy. SE1–SE17 invariants reused verbatim."""
    user_id = principal.id

    baseline = cv_repo.latest_baseline(user_id)
    if baseline is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload a baseline CV first.")

    structured: dict = baseline.get("cv_structured") or {}
    if not structured:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Baseline CV has no structured payload — re-upload the CV to enable edits.",
        )

    located = cv_skill_edit.locate_bullet(
        structured,
        body.old_text,
        section_hint=body.section_hint,
        item_index=body.item_index,
        bullet_index=body.bullet_index,
    )

    if located is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Could not find this bullet in your CV. Refresh and try again.",
        )

    if isinstance(located, cv_skill_edit.LocateConflict):
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
            detail=SkillEditConflictDetail(skill_key="", candidates=candidates).model_dump(),
        )

    if located.section not in cv_skill_edit.EDITABLE_SECTIONS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Rewrite is not supported for {located.section!r}. Edit on the CV page.",
        )

    new_structured = cv_skill_edit.apply_bullet_edit(structured, located, body.new_text)
    new_body_text = cv_skill_edit.render_baseline_text(new_structured)

    next_n = cv_repo.next_user_version_number(user_id)
    title = "Master CV · rewrite"
    spec = CVVersionWriteSpec(
        kind="baseline_upload",
        job_id=None,
        parent_version_id=None,
        body_text=new_body_text,
        cv_structured=new_structured,
        title=title,
        snapshot_hash=cv_compose.item_id("rewrite", next_n, new_body_text),
        confidence_label="user-edited",
    )
    new_baseline = cv_repo.create(user_id, spec)
    _mirror_rewrite_to_reservoir(cv_repo, user_id, located, body.old_text, body.new_text)

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


@router.get("/skill-edit/recompute-status/{baseline_id}", response_model=RecomputeStatusResponse)
def recompute_status(
    baseline_id: int,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> RecomputeStatusResponse:
    """Polled by the Skills page after a skill-edit save so it can stop the
    score-ring shimmer once record_cv_score has finished writing."""
    row = cv_repo.find(baseline_id, principal.id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Baseline not found.")
    return RecomputeStatusResponse(
        baseline_id=baseline_id,
        recompute_finished_at=row.get("recompute_finished_at"),
    )


@router.get("/skill-edit/recompute-status/{baseline_id}/stream")
async def stream_recompute_status(
    baseline_id: int,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> StreamingResponse:
    """ADR-0009 PR2 — live re-score progress over SSE (replaces the SE17 3s poll).

    Snapshot-watch relay over cv_versions.recompute_finished_at: emits a single
    `phase` (scoring) then `done` the moment the async re-tag stamps the flag.
    A hard timeout closes the stream so the score-ring shimmer never hangs."""
    user_id = principal.id

    async def gen() -> AsyncIterator[str]:
        started = time.monotonic()
        announced = False
        while True:
            row = cv_repo.find(baseline_id, user_id)
            if not row:
                yield progress_stream.sse(
                    {"type": "error", "recoverable": False, "message": "Baseline not found."}
                )
                return
            if row.get("recompute_finished_at"):
                yield progress_stream.sse({
                    "type": "done",
                    "result": {
                        "baseline_id": baseline_id,
                        "recompute_finished_at": row["recompute_finished_at"],
                    },
                })
                return
            if not announced:
                announced = True
                yield progress_stream.sse(
                    {"type": "phase", "phase": "scoring", "label": "Re-scoring your CV"}
                )
            else:
                yield progress_stream.HEARTBEAT

            if time.monotonic() - started > progress_stream.TIMEOUT_SECONDS:
                # Cap hit — settle the client (best-effort refresh on its side).
                yield progress_stream.sse({
                    "type": "done",
                    "result": {"baseline_id": baseline_id, "recompute_finished_at": None, "timeout": True},
                })
                return
            await asyncio.sleep(progress_stream.TICK_SECONDS)

    return StreamingResponse(
        gen(), media_type="text/event-stream", headers=progress_stream.SSE_HEADERS
    )


