"""POST /cv/apply-snapshot — record an immutable submitted-CV snapshot per Apply.

CVJT1: "immutable submitted-CV snapshots plus application attempts." When the user
hits Apply, the exact tailored CV they submitted is frozen against the job so the
tailoring effort is tied to the application (journey Entry 5.2). Own-only.
"""
from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.cv_apply_snapshot import get_apply_snapshot_repository


class _FakeRepo:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []

    def record(self, user_id: str, job_id: str, cv_snapshot: dict, cv_version_id, applied_url):
        row = {
            "id": f"a{len(self.rows) + 1}",
            "user_id": user_id,
            "job_id": job_id,
            "cv_snapshot": cv_snapshot,
            "cv_version_id": cv_version_id,
            "applied_url": applied_url,
            "submitted_at": datetime.now(timezone.utc),
        }
        self.rows.append(row)
        return row


def _override(repo: _FakeRepo) -> None:
    app.dependency_overrides[get_apply_snapshot_repository] = lambda: repo
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")


def test_apply_snapshot_records_the_submitted_cv() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/apply-snapshot",
                json={
                    "job_id": "job-123",
                    "cv_snapshot": {"text": "Led GTM…", "score": 78, "title": "Senior Marketing Manager"},
                    "cv_version_id": 42,
                    "applied_url": "https://githubinc.jibeapply.com/x",
                },
                headers={"Authorization": "Bearer t1"},
            )
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 201
    assert res.json()["submitted_at"]
    # snapshot frozen against the job, tied to the version, owned by the caller
    assert len(repo.rows) == 1
    row = repo.rows[0]
    assert row["job_id"] == "job-123"
    assert row["cv_snapshot"]["score"] == 78
    assert row["cv_version_id"] == 42
    assert row["user_id"] == "u1"


def test_apply_snapshot_requires_a_snapshot_body() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/apply-snapshot",
                json={"job_id": "job-1", "cv_snapshot": {}},
                headers={"Authorization": "Bearer t1"},
            )
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 422  # empty snapshot rejected — never record a blank attempt
