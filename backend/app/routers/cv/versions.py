"""Unified CV Versions router — handles every kind of CV Version write.

See CONTEXT.md for the domain vocabulary (CV Version, CV Lineage, Writer Seam).

Endpoints (mounted under /cv):
    GET    /versions[?job_id=...]              list baselines + per-job rows
    POST   /versions                           create deterministic from playground
    POST   /versions/{version_id}/polish       create polished child (LLM rewrite)
    POST   /versions/{version_id}/edit         create edited child with {edited_items}

Baseline rows are written by /cv/upload (services/cv_workflow). They are NOT created
via this router — uploads are the only way a baseline enters the system.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from supabase import Client

from app.deps import Principal, get_principal, get_user_db
from app.repositories.cv import (
    CVVersionWriteSpec,
    CVVersionsRepository,
    get_token_cv_repository,
)
from app.services import cv_compose, cv_restructure, xp_policy, xp_service
from app.services.job_path._db import _fetch_milestones, _fetch_targets, _get_job
from app.services.job_path.llm_polish import _call_ai_polish
from app.services.llm_provider import get_writer_provider
from app.routers.cv.structured import CVStructuredResponse

router = APIRouter(prefix="/versions")


# ── Schemas ───────────────────────────────────────────────────────────────────


class CVVersionCreateRequest(BaseModel):
    job_id:       str
    hidden_items: list[str] = []
    title:        str | None = None


class CVVersionEditRequest(BaseModel):
    edited_items: dict[str, str]
    title:        str | None = None


class CVVersionStructuredEditRequest(BaseModel):
    cv:    CVStructuredResponse
    title: str | None = None


class FooterMarkRequest(BaseModel):
    hidden: bool


class HiddenItemsRequest(BaseModel):
    hidden_items: list[str] = []


class CVVersionResponse(BaseModel):
    id:                   int
    user_version_number:  int
    kind:                 str
    job_id:               str | None
    parent_version_id:    int | None
    baseline_version_id:  int | None
    title:                str | None
    hidden_items:         list[str]
    edited_items:         dict[str, str]
    cv_structured:        dict[str, Any]
    body_text:            str
    polished_text:        str | None
    ai_polished:          bool
    created_at:           datetime
    job_title:            str | None = None
    company_name:         str | None = None
    footer_mark_hidden:   bool = False


class CVVersionListResponse(BaseModel):
    versions: list[CVVersionResponse]


# Whole-CV "Restructure with Mentor" (DESIGN_cv_playground_redesign §6.2, CVJT1) ──


class RestructureProposalResponse(BaseModel):
    mode:          str               # "proposal" | "error"
    proposed_text: str | None = None
    changes:       list[str] = []
    rationale:     str | None = None
    playbook:      str | None = None
    uncertainty:   str | None = None
    cost:          int = xp_policy.RESTRUCTURE_CV_XP_COST  # charged only on keep


class RestructureApplyRequest(BaseModel):
    proposed_text: str = Field(..., min_length=1)
    # Client-generated UUID, stable for one shown proposal — keys the keep-charge
    # ledger row so reconciliation can tie the 20-coin spend to this exact accept.
    proposal_id:   str = Field(..., min_length=1)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _to_response(row: dict[str, Any]) -> CVVersionResponse:
    job = row.get("jobs") or {}
    return CVVersionResponse(
        id=row["id"],
        user_version_number=row.get("user_version_number") or 1,
        kind=row.get("kind") or "deterministic",
        job_id=row.get("job_id"),
        parent_version_id=row.get("parent_version_id"),
        baseline_version_id=row.get("baseline_version_id"),
        title=row.get("title"),
        hidden_items=row.get("hidden_items") or [],
        edited_items=row.get("edited_items") or {},
        cv_structured=row.get("cv_structured") or {},
        body_text=row.get("body_text") or "",
        polished_text=row.get("polished_text"),
        ai_polished=bool(row.get("ai_polished")),
        created_at=row["created_at"],
        job_title=row.get("job_title") or job.get("job_title"),
        company_name=row.get("company_name") or job.get("company_name"),
        footer_mark_hidden=bool(row.get("footer_mark_hidden")),
    )


def _auto_title(kind: str, n: int) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    prefix = {
        "deterministic": "v",
        "polished":      "polished v",
        "edited":        "edited v",
    }.get(kind, "v")
    return f"{prefix}{n} · {stamp}"


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("", response_model=CVVersionListResponse)
def list_cv_versions(
    job_id: str | None = None,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> CVVersionListResponse:
    """Return baselines + scoped derivatives for the current user.

    With job_id query param: baselines + rows for that job's company.
    Without: all rows (baselines + every derivative for every job).
    """
    user_id = principal.id
    rows = (
        cv_repo.list_thread_for_job(user_id, job_id)
        if job_id is not None
        else cv_repo.list_all(user_id)
    )
    return CVVersionListResponse(versions=[_to_response(r) for r in rows])


@router.post("", response_model=CVVersionResponse, status_code=status.HTTP_201_CREATED)
def create_cv_version(
    body: CVVersionCreateRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    db: Client = Depends(get_user_db),
) -> CVVersionResponse:
    """Save a new deterministic version from the playground state."""
    user_id = principal.id
    baseline = cv_repo.latest_baseline(user_id)
    if baseline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload a baseline CV first.",
        )

    # Validate the job exists / user has access (RLS-enforced).
    _get_job(db, body.job_id)

    structured = baseline.get("cv_structured") or {}
    body_text = cv_compose.render_deterministic(
        structured,
        hidden_items=body.hidden_items,
        edited_items=None,
    )
    next_n = cv_repo.next_user_version_number(user_id)
    spec = CVVersionWriteSpec(
        kind="deterministic",
        job_id=body.job_id,
        parent_version_id=baseline["id"],
        body_text=body_text,
        cv_structured=structured,
        hidden_items=body.hidden_items,
        title=body.title or _auto_title("deterministic", next_n),
        snapshot_hash=cv_compose.item_id("save", next_n, body_text),
        confidence_label="user-curated",
    )
    return _to_response(cv_repo.create(user_id, spec))


@router.post(
    "/{version_id}/structured",
    response_model=CVVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
def edit_cv_version_structured(
    version_id: int,
    body: CVVersionStructuredEditRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> CVVersionResponse:
    """Create an editable child from a job-specific structured CV draft.

    Submitted/history rows stay immutable: mobile editing always appends a new
    child and leaves the parent available in the CV Hub.
    """
    user_id = principal.id
    parent = cv_repo.find(version_id, user_id)
    if not parent:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parent CV version not found.")
    if not parent.get("job_id"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Use the Main CV editor for your Main CV.")

    structured = body.cv.model_dump()
    hidden_items = parent.get("hidden_items") or []
    body_text = cv_compose.render_deterministic(
        structured,
        hidden_items=hidden_items,
        edited_items=None,
    )
    next_n = cv_repo.next_user_version_number(user_id)
    spec = CVVersionWriteSpec(
        kind="edited",
        job_id=parent["job_id"],
        parent_version_id=parent["id"],
        body_text=body_text,
        polished_text=body_text,
        cv_structured=structured,
        hidden_items=hidden_items,
        title=body.title or _auto_title("edited", next_n),
        snapshot_hash=cv_compose.item_id("structured_edit", next_n, body_text),
        confidence_label="user-edited",
    )
    return _to_response(cv_repo.create(user_id, spec))


@router.patch("/{version_id}/hidden-items", response_model=CVVersionResponse)
def update_cv_version_hidden_items(
    version_id: int,
    body: HiddenItemsRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> CVVersionResponse:
    """Auto-save the playground projection (which bullets are shown for this job)
    in place on the job's deterministic working draft.

    Option C drops the explicit Save button — hide/show edits persist as the user
    works. Only a job-scoped deterministic draft is mutable here; submitted /
    edited / polished snapshots stay immutable (CVJT1). The body_text is recomputed
    from the draft's structured snapshot so the stored copy matches the projection.
    """
    user_id = principal.id
    version = cv_repo.find(version_id, user_id)
    if not version:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "CV version not found.")
    if version.get("kind") != "deterministic" or not version.get("job_id"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Only a job-specific working draft can be auto-saved in place.",
        )
    body_text = cv_compose.render_deterministic(
        version.get("cv_structured") or {},
        hidden_items=body.hidden_items,
        edited_items=None,
    )
    row = cv_repo.update_hidden_items(version_id, user_id, body.hidden_items, body_text)
    return _to_response(row)


@router.post("/promote-master", response_model=CVVersionResponse)
def promote_projection_to_master(
    body: HiddenItemsRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> CVVersionResponse:
    """Make a projection (its hidden_items) the living master's shape.

    Delta-4 (project_living_cv_delta4): the CV a user just applied with becomes
    their one living master, so it persists + seeds every future tailoring. The
    master's content is unchanged — only which bullets it shows. Every new job
    thread already hydrates its initial hidden_items from the master, so the
    applied shape auto-propagates. 404 if no baseline exists yet.
    """
    row = cv_repo.set_master_hidden_items(principal.id, body.hidden_items)
    return _to_response(row)


class RestoreMasterRequest(BaseModel):
    cv:           CVStructuredResponse
    hidden_items: list[str] = []


@router.post("/restore-master", response_model=CVVersionResponse)
def restore_master(
    body: RestoreMasterRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> CVVersionResponse:
    """Make a past applied CV the living master again (Delta-4 restore).

    Overwrites the master's content + shape with the chosen version. The prior
    master is preserved in cv_master_revisions by update_master, so a restore is
    itself reversible. project_living_cv_delta4.
    """
    structured = body.cv.model_dump()
    body_text = cv_compose.render_deterministic(
        structured, hidden_items=body.hidden_items, edited_items=None,
    )
    row = cv_repo.update_master(
        principal.id,
        body_text=body_text,
        cv_structured=structured,
        snapshot_hash=cv_compose.item_id("restore", 0, body_text),
        hidden_items=body.hidden_items,
    )
    return _to_response(row)


@router.patch("/{version_id}/footer-mark", response_model=CVVersionResponse)
def set_footer_mark(
    version_id: int,
    body: FooterMarkRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> CVVersionResponse:
    """Toggle the Myro footer mark on a CV Version (certified ⇄ un-certified)."""
    row = cv_repo.set_footer_mark(version_id, principal.id, body.hidden)
    return _to_response(row)


@router.post(
    "/{version_id}/polish",
    response_model=CVVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def polish_cv_version(
    version_id: int,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    db: Client = Depends(get_user_db),
) -> CVVersionResponse:
    """Create a new child version with LLM-polished text. Parent stays immutable."""
    user_id = principal.id
    parent = cv_repo.find(version_id, user_id)
    if not parent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent CV version not found.",
        )
    if not parent.get("job_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Baselines cannot be polished. Save a deterministic version first.",
        )

    job_id = parent["job_id"]
    job = _get_job(db, job_id)
    targets = _fetch_targets(db, user_id, job_id)
    completed_rows = [
        row for row in _fetch_milestones(db, user_id, job_id) if row.get("completed_at")
    ]
    completed = sorted(completed_rows, key=lambda row: str(row.get("completed_at") or ""))

    polished_text = await _call_ai_polish(
        baseline_text=parent.get("body_text") or "",
        job=job,
        targets=targets,
        completed=completed,
        provider=get_writer_provider(),
    )
    if not polished_text:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI polish unavailable right now. Please try again in a minute.",
        )

    next_n = cv_repo.next_user_version_number(user_id)
    spec = CVVersionWriteSpec(
        kind="polished",
        job_id=job_id,
        parent_version_id=parent["id"],
        body_text=parent.get("body_text") or "",
        cv_structured=parent.get("cv_structured") or {},
        polished_text=polished_text,
        hidden_items=parent.get("hidden_items") or [],
        edited_items=parent.get("edited_items") or {},
        title=_auto_title("polished", next_n),
        snapshot_hash=cv_compose.item_id("polish", next_n, polished_text),
        confidence_label="ai-polished",
        proof_count=len(completed),
        ai_polished=True,
        ai_polish_used_at=datetime.now(timezone.utc).isoformat(),
    )
    return _to_response(cv_repo.create(user_id, spec))


@router.post(
    "/{version_id}/edit",
    response_model=CVVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
def edit_cv_version(
    version_id: int,
    body: CVVersionEditRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> CVVersionResponse:
    """Create a new child version with edited polished bullets.

    Baselines and pure-deterministic rows are not directly editable — polish them
    first. Edits operate on the polished_text via string replace.
    """
    user_id = principal.id
    parent = cv_repo.find(version_id, user_id)
    if not parent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent CV version not found.",
        )
    if parent.get("kind") not in ("polished", "edited"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only polished or edited versions can be further edited. Polish first.",
        )
    parent_polished = parent.get("polished_text") or ""
    if not parent_polished:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Parent version has no polished text to edit.",
        )

    merged_edits: dict[str, str] = {**(parent.get("edited_items") or {}), **body.edited_items}
    new_polished = parent_polished
    for old, new in body.edited_items.items():
        if not old or not new:
            continue
        new_polished = new_polished.replace(old, new)

    next_n = cv_repo.next_user_version_number(user_id)
    spec = CVVersionWriteSpec(
        kind="edited",
        job_id=parent.get("job_id"),
        parent_version_id=parent["id"],
        body_text=parent.get("body_text") or "",
        cv_structured=parent.get("cv_structured") or {},
        polished_text=new_polished,
        hidden_items=parent.get("hidden_items") or [],
        edited_items=merged_edits,
        title=body.title or _auto_title("edited", next_n),
        snapshot_hash=cv_compose.item_id("edit", next_n, new_polished),
        confidence_label="user-edited",
        proof_count=int(parent.get("proof_count") or 0),
        ai_polished=bool(parent.get("ai_polished")),
    )
    return _to_response(cv_repo.create(user_id, spec))


def _require_job_parent(
    version_id: int, user_id: str, cv_repo: CVVersionsRepository
) -> dict[str, Any]:
    """Load a job-scoped parent version or raise. Restructure operates on a
    tailored copy (has job_id); baselines are never restructured in place."""
    parent = cv_repo.find(version_id, user_id)
    if not parent:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parent CV version not found.")
    if not parent.get("job_id"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Save a tailored copy for this job before restructuring.",
        )
    return parent


@router.post("/{version_id}/restructure", response_model=RestructureProposalResponse)
async def restructure_cv_version(
    version_id: int,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    db: Client = Depends(get_user_db),
) -> RestructureProposalResponse:
    """Propose a whole-CV restructure (reorder / merge / cut) for this job.

    Stateless and FREE — writes nothing, charges nothing. The user reviews the
    proposal and only pays on keep (see /restructure/apply). §6.2 / CVJT1."""
    user_id = principal.id
    parent = _require_job_parent(version_id, user_id, cv_repo)

    job = _get_job(db, parent["job_id"])
    targets = _fetch_targets(db, user_id, parent["job_id"])
    missing_keywords = [t.get("skill") for t in targets if t.get("skill")]

    result = await cv_restructure.suggest_restructure(
        cv_text=parent.get("polished_text") or parent.get("body_text") or "",
        role=job.get("job_title"),
        company=job.get("company_name"),
        missing_keywords=missing_keywords,
    )
    return RestructureProposalResponse(
        mode=result["mode"],
        proposed_text=result.get("proposed_text"),
        changes=result.get("changes") or [],
        rationale=result.get("rationale"),
        playbook=result.get("playbook"),
        uncertainty=result.get("uncertainty"),
    )


@router.post(
    "/{version_id}/restructure/apply",
    response_model=CVVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def restructure_apply(
    version_id: int,
    body: RestructureApplyRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> CVVersionResponse:
    """Keep a restructure proposal: charge 20 Myro Coins, then write a new
    ``polished`` child. Charge fires here (on keep) only — failed/rejected/
    discarded proposals never reach this endpoint, so they cost nothing (CVJT1).

    Ordering mirrors the CV-upload charge (XP-DB4): charge BEFORE the write so no
    unpaid version can exist; refund (idempotent on proposal_id) if the write
    throws after the charge."""
    user_id = principal.id
    parent = _require_job_parent(version_id, user_id, cv_repo)

    try:
        await xp_service.charge_or_raise(
            user_id,
            xp_policy.RESTRUCTURE_CV_XP_COST,
            "cv_restructure",
            floor=xp_policy.RESTRUCTURE_CV_XP_FLOOR,
            ref_table="cv_restructure",
            ref_id=body.proposal_id,
        )
    except xp_service.InsufficientXPError as exc:
        # XP-CTA: the service stays domain-free; the caller owns the recovery copy.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{exc.detail} Earn more by practising a skill or logging your diary.",
        ) from exc

    next_n = cv_repo.next_user_version_number(user_id)
    spec = CVVersionWriteSpec(
        kind="polished",
        job_id=parent["job_id"],
        parent_version_id=parent["id"],
        body_text=parent.get("body_text") or "",
        cv_structured=parent.get("cv_structured") or {},
        polished_text=body.proposed_text,
        hidden_items=parent.get("hidden_items") or [],
        edited_items=parent.get("edited_items") or {},
        title=_auto_title("polished", next_n),
        snapshot_hash=cv_compose.item_id("restructure", next_n, body.proposed_text),
        confidence_label="ai-restructured",
        proof_count=int(parent.get("proof_count") or 0),
        ai_polished=True,
        ai_polish_used_at=datetime.now(timezone.utc).isoformat(),
    )
    try:
        row = cv_repo.create(user_id, spec)
    except Exception:
        # Write failed after the charge — give the coins back (idempotent on ref).
        await xp_service.refund(
            user_id,
            xp_policy.RESTRUCTURE_CV_XP_COST,
            "cv_restructure",
            "write_failed",
            ref_table="cv_restructure",
            ref_id=body.proposal_id,
        )
        raise
    return _to_response(row)
