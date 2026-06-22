"""API tests for the resumable direct-to-storage CV upload (BUG-2 real fix).

The browser uploads the CV straight to the private cv-uploads bucket (Supabase
native resumable/TUS), then calls POST /cv/upload/finalize with the storage path.
finalize downloads the bytes (service-role) and runs the IDENTICAL parse/charge/
score pipeline as the multipart route — so these mirror test_cv_upload_api.py.
"""
from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.cv import get_token_cv_repository
from app.services import cv_workflow


class _FakeCVRepository:
    def __init__(self) -> None:
        self.client = object()

    def find_by_content_hash(self, _user_id: str, _content_hash: str) -> None:
        return None

    def count_user_skills(self, _user_id: str) -> int:
        return 0

    def get_current_score(self, _user_id: str) -> float | None:
        return None


class _FakeStorageBucket:
    def __init__(self, data: bytes = b"%PDF", raise_download: bool = False) -> None:
        self.data = data
        self.raise_download = raise_download
        self.downloaded: str | None = None
        self.removed: list[str] = []

    def from_(self, _bucket: str) -> "_FakeStorageBucket":
        return self

    def download(self, path: str) -> bytes:
        if self.raise_download:
            raise RuntimeError("object gone")
        self.downloaded = path
        return self.data

    def remove(self, paths: list[str]) -> None:
        self.removed.extend(paths)


class _FakeAdmin:
    def __init__(self, storage: _FakeStorageBucket) -> None:
        self.storage = storage


def _override_principal_and_repo(repo) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_token_cv_repository] = lambda: repo


def _patch_storage(monkeypatch, storage: _FakeStorageBucket) -> None:
    monkeypatch.setattr(cv_workflow, "get_supabase_admin", lambda: _FakeAdmin(storage))


def _patch_async_workflow(monkeypatch) -> None:
    async def _noop_run(**_kwargs):  # type: ignore[no-untyped-def]
        return None
    monkeypatch.setattr(cv_workflow, "_run_cv_upload_job", _noop_run)


def _patch_xp(monkeypatch, *, balance: int = 3000) -> dict[str, Any]:
    state = {"balance": balance, "charged": 0, "refunded": 0, "last_ref": None}
    async def _charge(user_id, amount, action, *, floor=0, ref_table=None, ref_id=None):
        if state["balance"] - amount < floor:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Out of Myro Coins")
        state["balance"] -= amount
        state["charged"] += amount
        state["last_ref"] = (ref_table, ref_id)
        return state["balance"]
    async def _refund(user_id, amount, action, reason, *, ref_table, ref_id):
        state["balance"] += amount
        state["refunded"] += amount
        return state["balance"]
    async def _balance(user_id):
        return state["balance"]
    monkeypatch.setattr(cv_workflow, "charge_or_raise", _charge)
    monkeypatch.setattr(cv_workflow, "refund", _refund)
    monkeypatch.setattr(cv_workflow, "get_xp_balance", _balance)
    return state


def _patch_jobs_create(monkeypatch, *, job_id: str = "job-fin") -> None:
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "create_processing_job", lambda **_k: job_id)
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "mark_charged", lambda *_a, **_k: None)
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "mark_failed", lambda *_a, **_k: None)


def _good_text(*_a, **_k) -> str:
    return "Python engineer with five years building production APIs, data pipelines, and reliable backend systems."


def test_finalize_downloads_then_queues_job_and_deletes_object(monkeypatch) -> None:
    _override_principal_and_repo(_FakeCVRepository())
    storage = _FakeStorageBucket(data=b"%PDF-1.4 real bytes")
    _patch_storage(monkeypatch, storage)
    state = _patch_xp(monkeypatch, balance=3000)
    monkeypatch.setattr(cv_workflow.cv_parser, "extract_raw_text", _good_text)
    _patch_jobs_create(monkeypatch, job_id="job-fin")
    _patch_async_workflow(monkeypatch)
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "find_by_idempotency_key", lambda *_a, **_k: None)

    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/upload/finalize",
                json={"storage_path": "u1/key-1.pdf", "idempotency_key": "idem-1", "source": "pdf_upload"},
            )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 202
    body = res.json()
    assert body["status"] == "processing"
    assert body["job_id"] == "job-fin"
    assert state["charged"] == 200
    assert state["last_ref"] == ("cv_upload_jobs", "job-fin")  # XP-DB4 charge tied to job
    assert storage.downloaded == "u1/key-1.pdf"
    assert storage.removed == ["u1/key-1.pdf"]  # cleaned up after success


def test_finalize_rejects_foreign_storage_path_without_download(monkeypatch) -> None:
    _override_principal_and_repo(_FakeCVRepository())
    storage = _FakeStorageBucket()
    _patch_storage(monkeypatch, storage)

    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/upload/finalize",
                json={"storage_path": "someone-else/key.pdf", "idempotency_key": "x"},
            )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 403
    assert storage.downloaded is None  # ownership enforced before any storage read


def test_finalize_idempotency_replay_skips_download(monkeypatch) -> None:
    _override_principal_and_repo(_FakeCVRepository())
    storage = _FakeStorageBucket()
    _patch_storage(monkeypatch, storage)
    monkeypatch.setattr(
        cv_workflow.upload_jobs_repo, "find_by_idempotency_key",
        lambda *_a, **_k: {"status": "done", "skills_detected": 3, "score": 50.0, "xp_charged": 0},
    )

    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/upload/finalize",
                json={"storage_path": "u1/key-2.pdf", "idempotency_key": "idem-dup"},
            )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 202
    body = res.json()
    assert body["status"] == "done"
    assert body["skills_detected"] == 3
    # Replayed finalize must NOT touch storage — the object is already deleted.
    assert storage.downloaded is None


def test_finalize_returns_410_when_object_missing(monkeypatch) -> None:
    _override_principal_and_repo(_FakeCVRepository())
    storage = _FakeStorageBucket(raise_download=True)
    _patch_storage(monkeypatch, storage)
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "find_by_idempotency_key", lambda *_a, **_k: None)

    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/upload/finalize",
                json={"storage_path": "u1/key-gone.pdf", "idempotency_key": "idem-gone"},
            )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 410
    assert res.json()["detail"]["code"] == "upload_expired"


def test_finalize_unreadable_text_422_deletes_object(monkeypatch) -> None:
    _override_principal_and_repo(_FakeCVRepository())
    storage = _FakeStorageBucket()
    _patch_storage(monkeypatch, storage)
    _patch_xp(monkeypatch, balance=3000)
    monkeypatch.setattr(cv_workflow.cv_parser, "extract_raw_text", lambda *_a, **_k: "   ")  # < 80 chars → CVUP4 guard
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "find_by_idempotency_key", lambda *_a, **_k: None)

    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/upload/finalize",
                json={"storage_path": "u1/scan.pdf", "idempotency_key": "idem-scan"},
            )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 422
    assert storage.removed == ["u1/scan.pdf"]  # permanent rejection → object dropped
