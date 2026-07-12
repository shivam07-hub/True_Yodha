"""POST /cv/apply-snapshot — freeze the submitted CV against a job on Apply.

CVJT1 immutable snapshot + application attempt (journey Entry 5.2). The Apply
moment records the exact CV the user submitted so the tailoring is tied to the
application, then the client opens the source link.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field, field_validator

from app.deps import CurrentUser, get_current_user
from app.repositories.cv_apply_snapshot import (
    ApplySnapshotRepository,
    get_apply_snapshot_repository,
)

router = APIRouter()


class ApplySnapshotRequest(BaseModel):
    job_id: str = Field(..., min_length=1)
    cv_snapshot: dict[str, Any]
    cv_version_id: int | None = None
    applied_url: str | None = None

    @field_validator("cv_snapshot")
    @classmethod
    def snapshot_not_empty(cls, v: dict[str, Any]) -> dict[str, Any]:
        if not v:
            raise ValueError("cv_snapshot cannot be empty")
        return v


class ApplySnapshotResponse(BaseModel):
    id: str
    submitted_at: datetime | None = None


class AppliedVersion(BaseModel):
    """One entry in the applied-CV history (Delta-4 'Versions')."""
    id: str
    job_id: str | None = None
    cv_version_id: int | None = None
    cv_snapshot: dict[str, Any]
    applied_url: str | None = None
    submitted_at: datetime | None = None


class AppliedVersionsResponse(BaseModel):
    versions: list[AppliedVersion]


@router.post("/apply-snapshot", response_model=ApplySnapshotResponse, status_code=status.HTTP_201_CREATED)
def apply_snapshot(
    body: ApplySnapshotRequest,
    user: CurrentUser = Depends(get_current_user),
    repo: ApplySnapshotRepository = Depends(get_apply_snapshot_repository),
) -> ApplySnapshotResponse:
    row = repo.record(user.id, body.job_id, body.cv_snapshot, body.cv_version_id, body.applied_url)
    return ApplySnapshotResponse(id=str(row.get("id", "")), submitted_at=row.get("submitted_at"))


@router.get("/apply-snapshots", response_model=AppliedVersionsResponse)
def list_applied_versions(
    user: CurrentUser = Depends(get_current_user),
    repo: ApplySnapshotRepository = Depends(get_apply_snapshot_repository),
) -> AppliedVersionsResponse:
    """The user's version history — every CV they applied with, newest first.

    Delta-4 (project_living_cv_delta4): a 'Version' is a CV a user *applied*
    with, not a WIP autosave. This is the Google-Docs-style version list.
    """
    rows = repo.list_for_user(user.id)
    return AppliedVersionsResponse(
        versions=[
            AppliedVersion(
                id=str(r.get("id", "")),
                job_id=r.get("job_id"),
                cv_version_id=r.get("cv_version_id"),
                cv_snapshot=r.get("cv_snapshot") or {},
                applied_url=r.get("applied_url"),
                submitted_at=r.get("submitted_at"),
            )
            for r in rows
        ]
    )
