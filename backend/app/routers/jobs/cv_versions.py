"""Per-job CV Versions — Git-commit-style immutable versions for the CV Builder.

Endpoints (all under /jobs/{job_id}/cv-versions):
    GET    /                        list all versions, latest first
    POST   /                        create new deterministic version from {hidden_items}
    POST   /{version_id}/polish     create new polished child version (LLM rewrite)
    POST   /{version_id}/edit       create new edited child version with {edited_items}

Versioning model (Q11 + Q18d locks):
    - Every Save / Polish / Edit = NEW row. No mutation of existing rows.
    - `job_version_number` is monotonic per (user_id, job_id).
    - `parent_version_id` links polish + edit children back to their source.
    - `version_kind` ∈ {deterministic, polished, edited}.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import Client

from app.database import get_supabase_for_token
from app.deps import get_current_user
from app.repositories.cv import CVRepository, get_token_cv_repository
from app.services import cv_compose, cv_workflow
from app.services.job_path._db import _fetch_milestones, _fetch_targets, _get_job
from app.services.job_path._helpers import _single_or_none
from app.services.job_path.cv_generator import _completed_milestones
from app.services.job_path.llm_polish import _call_ai_polish
from app.services.llm_provider import LLMProvider

router = APIRouter(prefix="/{job_id}/cv-versions")


# ── Schemas ───────────────────────────────────────────────────────────────────


class CVVersionCreateRequest(BaseModel):
    hidden_items: list[str] = []
    title: str | None = None


class CVVersionEditRequest(BaseModel):
    edited_items: dict[str, str]
    title: str | None = None


class CVVersionResponse(BaseModel):
    id: int
    job_version_number: int
    parent_version_id: int | None
    version_kind: str
    title: str | None
    hidden_items: list[str]
    edited_items: dict[str, str]
    deterministic_text: str
    polished_text: str | None
    created_at: datetime


class CVVersionListResponse(BaseModel):
    versions: list[CVVersionResponse]


# ── Helpers ───────────────────────────────────────────────────────────────────


def _db_dep(current_user: dict = Depends(get_current_user)) -> Client:
    return get_supabase_for_token(current_user["token"])


def _next_job_version(db: Client, user_id: str, job_id: str) -> int:
    row = _single_or_none(
        db.table("job_cv_variants")
        .select("job_version_number")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .order("job_version_number", desc=True)
        .limit(1)
    )
    return int((row or {}).get("job_version_number") or 0) + 1


def _auto_title(kind: str, n: int) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    prefix = {"deterministic": "v", "polished": "polished v", "edited": "edited v"}.get(kind, "v")
    return f"{prefix}{n} · {stamp}"


def _to_response(row: dict[str, Any]) -> CVVersionResponse:
    return CVVersionResponse(
        id=row["id"],
        job_version_number=row.get("job_version_number") or 1,
        parent_version_id=row.get("parent_version_id"),
        version_kind=row.get("version_kind") or "deterministic",
        title=row.get("title"),
        hidden_items=row.get("hidden_items") or [],
        edited_items=row.get("edited_items") or {},
        deterministic_text=row.get("deterministic_text") or "",
        polished_text=row.get("polished_text"),
        created_at=row["created_at"],
    )


def _fetch_version(db: Client, user_id: str, job_id: str, version_id: int) -> dict[str, Any]:
    row = _single_or_none(
        db.table("job_cv_variants")
        .select("*")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .eq("id", version_id)
        .limit(1)
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV version not found.")
    return row


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("", response_model=CVVersionListResponse)
async def list_cv_versions(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(_db_dep),
) -> CVVersionListResponse:
    rows = (
        db.table("job_cv_variants")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .eq("job_id", job_id)
        .order("job_version_number", desc=True)
        .execute()
    ).data or []
    return CVVersionListResponse(versions=[_to_response(r) for r in rows])


@router.post("", response_model=CVVersionResponse, status_code=status.HTTP_201_CREATED)
async def create_cv_version(
    job_id: str,
    body: CVVersionCreateRequest,
    current_user: dict = Depends(get_current_user),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
    db: Client = Depends(_db_dep),
) -> CVVersionResponse:
    """Save a new deterministic version from the playground state."""
    user_id = current_user["user_id"]
    structured = await cv_workflow.get_or_backfill_cv_structured(cv_repo, user_id)
    if structured is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload a baseline CV first.",
        )

    # Validate job exists (and that user has access to it via RLS).
    _get_job(db, job_id)

    deterministic_text = cv_compose.render_deterministic(
        structured,
        hidden_items=body.hidden_items,
        edited_items=None,
    )

    next_n = _next_job_version(db, user_id, job_id)
    payload = {
        "user_id":            user_id,
        "job_id":             job_id,
        "cv_version_number":  1,  # legacy column — kept for compat
        "job_version_number": next_n,
        "parent_version_id":  None,
        "version_kind":       "deterministic",
        "title":              body.title or _auto_title("deterministic", next_n),
        "hidden_items":       body.hidden_items,
        "edited_items":       {},
        "deterministic_text": deterministic_text,
        "polished_text":      None,
        "snapshot_hash":      cv_compose.item_id("save", next_n, deterministic_text),
        "confidence_label":   "user-curated",
        "proof_count":        0,
        "ai_polished":        False,
    }
    inserted = db.table("job_cv_variants").insert(payload).execute()
    if not inserted.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save CV version.",
        )
    return _to_response(inserted.data[0])


@router.post("/{version_id}/polish", response_model=CVVersionResponse, status_code=status.HTTP_201_CREATED)
async def polish_cv_version(
    job_id: str,
    version_id: int,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(_db_dep),
) -> CVVersionResponse:
    """Create a new child version with LLM-polished text. Parent stays immutable."""
    user_id = current_user["user_id"]
    parent = _fetch_version(db, user_id, job_id, version_id)

    job = _get_job(db, job_id)
    targets = _fetch_targets(db, user_id, job_id)
    completed = _completed_milestones(_fetch_milestones(db, user_id, job_id))

    polished_text = await _call_ai_polish(
        baseline_text=parent.get("deterministic_text") or "",
        job=job,
        targets=targets,
        completed=completed,
        provider=LLMProvider(),
    )
    if not polished_text:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI polish unavailable right now. Please try again in a minute.",
        )

    next_n = _next_job_version(db, user_id, job_id)
    payload = {
        "user_id":            user_id,
        "job_id":             job_id,
        "cv_version_number":  1,
        "job_version_number": next_n,
        "parent_version_id":  parent["id"],
        "version_kind":       "polished",
        "title":              _auto_title("polished", next_n),
        "hidden_items":       parent.get("hidden_items") or [],
        "edited_items":       parent.get("edited_items") or {},
        "deterministic_text": parent.get("deterministic_text") or "",
        "polished_text":      polished_text,
        "snapshot_hash":      cv_compose.item_id("polish", next_n, polished_text),
        "confidence_label":   "ai-polished",
        "proof_count":        len(completed),
        "ai_polished":        True,
        "ai_polish_used_at":  datetime.now(timezone.utc).isoformat(),
    }
    inserted = db.table("job_cv_variants").insert(payload).execute()
    if not inserted.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save polished CV version.",
        )
    return _to_response(inserted.data[0])


@router.post("/{version_id}/edit", response_model=CVVersionResponse, status_code=status.HTTP_201_CREATED)
async def edit_cv_version(
    job_id: str,
    version_id: int,
    body: CVVersionEditRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(_db_dep),
) -> CVVersionResponse:
    """Create a new child version with edited polished bullets.

    Q18e lock: only polished versions are editable (baseline = truth of record).
    """
    user_id = current_user["user_id"]
    parent = _fetch_version(db, user_id, job_id, version_id)
    if (parent.get("version_kind") not in ("polished", "edited")):
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

    next_n = _next_job_version(db, user_id, job_id)
    payload = {
        "user_id":            user_id,
        "job_id":             job_id,
        "cv_version_number":  1,
        "job_version_number": next_n,
        "parent_version_id":  parent["id"],
        "version_kind":       "edited",
        "title":              body.title or _auto_title("edited", next_n),
        "hidden_items":       parent.get("hidden_items") or [],
        "edited_items":       merged_edits,
        "deterministic_text": parent.get("deterministic_text") or "",
        "polished_text":      new_polished,
        "snapshot_hash":      cv_compose.item_id("edit", next_n, new_polished),
        "confidence_label":   "user-edited",
        "proof_count":        parent.get("proof_count") or 0,
        "ai_polished":        bool(parent.get("ai_polished")),
    }
    inserted = db.table("job_cv_variants").insert(payload).execute()
    if not inserted.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save edited CV version.",
        )
    return _to_response(inserted.data[0])
