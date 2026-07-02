"""cv_apply_snapshot — immutable submitted-CV snapshots (CVJT1, journey 5.2).

One append-only row per Apply: the exact CV the user submitted, frozen against the
job. Own-only (RLS); no update path — a submission is a historical fact. Ties the
tailoring effort to the application it was for.
"""
from __future__ import annotations

from typing import Any

from fastapi import Depends
from supabase import Client

from app.deps import get_user_db


class ApplySnapshotRepository:
    def __init__(self, db: Client):
        self._db = db

    def record(
        self,
        user_id: str,
        job_id: str,
        cv_snapshot: dict[str, Any],
        cv_version_id: int | None,
        applied_url: str | None,
    ) -> dict[str, Any]:
        result = (
            self._db.table("cv_application_attempts")
            .insert(
                {
                    "user_id": user_id,
                    "job_id": job_id,
                    "cv_snapshot": cv_snapshot,
                    "cv_version_id": cv_version_id,
                    "applied_url": applied_url,
                }
            )
            .execute()
        )
        return (result.data or [{}])[0]


def get_apply_snapshot_repository(db: Client = Depends(get_user_db)) -> ApplySnapshotRepository:
    return ApplySnapshotRepository(db)
