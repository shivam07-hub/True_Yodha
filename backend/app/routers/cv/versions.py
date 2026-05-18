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
from pydantic import BaseModel
from supabase import Client

from app.database import get_supabase_for_token
from app.deps import get_current_user
from app.repositories.cv import (
    CVVersionWriteSpec,
    CVVersionsRepository,
    get_token_cv_repository,
)
from app.services import cv_compose
from app.services.job_path._db import _fetch_milestones, _fetch_targets, _get_job
from app.services.job_path.llm_polish import _call_ai_polish
from app.services.llm_provider import get_llm_provider

router = APIRouter(prefix="/versions")


# ── Schemas ───────────────────────────────────────────────────────────────────


class CVVersionCreateRequest(BaseModel):
    job_id:       str
    hidden_items: list[str] = []
    title:        str | None = None


class CVVersionEditRequest(BaseModel):
    edited_items: dict[str, str]
    title:        str | None = None


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
    body_text:            str
    polished_text:        str | None
    ai_polished:          bool
    created_at:           datetime


class CVVersionListResponse(BaseModel):
    versions: list[CVVersionResponse]


# ── Helpers ───────────────────────────────────────────────────────────────────


def _db_dep(current_user: dict = Depends(get_current_user)) -> Client:
    return get_supabase_for_token(current_user["token"])


def _to_response(row: dict[str, Any]) -> CVVersionResponse:
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
        body_text=row.get("body_text") or "",
        polished_text=row.get("polished_text"),
        ai_polished=bool(row.get("ai_polished")),
        created_at=row["created_at"],
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
async def list_cv_versions(
    job_id: str | None = None,
    current_user: dict = Depends(get_current_user),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> CVVersionListResponse:
    """Return baselines + per-job derivatives for the current user.

    With job_id query param: baselines + rows for that job.
    Without: all rows (baselines + every derivative for every job).
    """
    rows = cv_repo.list_versions(current_user["user_id"], job_id=job_id)
    return CVVersionListResponse(versions=[_to_response(r) for r in rows])


@router.post("", response_model=CVVersionResponse, status_code=status.HTTP_201_CREATED)
async def create_cv_version(
    body: CVVersionCreateRequest,
    current_user: dict = Depends(get_current_user),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    db: Client = Depends(_db_dep),
) -> CVVersionResponse:
    """Save a new deterministic version from the playground state."""
    user_id = current_user["user_id"]
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
    "/{version_id}/polish",
    response_model=CVVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def polish_cv_version(
    version_id: int,
    current_user: dict = Depends(get_current_user),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    db: Client = Depends(_db_dep),
) -> CVVersionResponse:
    """Create a new child version with LLM-polished text. Parent stays immutable."""
    user_id = current_user["user_id"]
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
        provider=get_llm_provider(),
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
async def edit_cv_version(
    version_id: int,
    body: CVVersionEditRequest,
    current_user: dict = Depends(get_current_user),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> CVVersionResponse:
    """Create a new child version with edited polished bullets.

    Baselines and pure-deterministic rows are not directly editable — polish them
    first. Edits operate on the polished_text via string replace.
    """
    user_id = current_user["user_id"]
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
