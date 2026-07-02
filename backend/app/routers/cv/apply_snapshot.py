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


@router.post("/apply-snapshot", response_model=ApplySnapshotResponse, status_code=status.HTTP_201_CREATED)
def apply_snapshot(
    body: ApplySnapshotRequest,
    user: CurrentUser = Depends(get_current_user),
    repo: ApplySnapshotRepository = Depends(get_apply_snapshot_repository),
) -> ApplySnapshotResponse:
    row = repo.record(user.id, body.job_id, body.cv_snapshot, body.cv_version_id, body.applied_url)
    return ApplySnapshotResponse(id=str(row.get("id", "")), submitted_at=row.get("submitted_at"))
