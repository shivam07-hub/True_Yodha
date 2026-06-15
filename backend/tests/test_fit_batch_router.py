"""Tests for POST /jobs/fit-batch — the logged-in /intel drill fit %.

Locked guarantees (intel-authed grill 2026-06-16): deterministic, no LLM, no
charge, no persist; reuses the canonical `_compute_overlap` so the number
matches the dashboard; jobs with no taxonomy rows are omitted (unknown fit, not
0% fit); request size is capped.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import get_token_jobs_repository
from app.routers.jobs.analyse import FIT_BATCH_MAX


class _FakeRepo:
    def __init__(self, rows: list[dict], skill_map: dict[str, int]) -> None:
        self._rows = rows
        self._skill_map = skill_map
        self.requested_ids: list[str] | None = None

    def get_all_job_skill_rows(self, *, job_ids: list[str] | None = None) -> list[dict]:
        self.requested_ids = job_ids
        ids = set(job_ids or [])
        return [r for r in self._rows if r.get("job_id") in ids]

    def get_user_skill_map(self, user_id: str) -> dict[str, int]:
        return self._skill_map


def _wire(repo: _FakeRepo) -> None:
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email="a@b.co")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo


def _unwire() -> None:
    app.dependency_overrides.clear()


def _rows() -> list[dict]:
    return [
        # j1 — one primary hit (python), one primary miss (rust): 2/(2+2)=50%
        {"job_id": "j1", "is_primary": True, "skills": {"taxonomy_key": "python"}},
        {"job_id": "j1", "is_primary": True, "skills": {"taxonomy_key": "rust"}},
        # j2 — primary hit + secondary hit: full overlap = 100%
        {"job_id": "j2", "is_primary": True, "skills": {"taxonomy_key": "python"}},
        {"job_id": "j2", "is_primary": False, "skills": {"taxonomy_key": "sql"}},
        # j3 — has NO skill rows at all (absent from _rows) → omitted
    ]


def test_fit_batch_computes_overlap_per_job():
    repo = _FakeRepo(_rows(), {"python": 3, "sql": 2})
    _wire(repo)
    try:
        with TestClient(app) as client:
            res = client.post("/jobs/fit-batch", json={"job_ids": ["j1", "j2", "j3"]})
    finally:
        _unwire()

    assert res.status_code == 200
    fits = {f["job_id"]: f for f in res.json()["fits"]}
    # j3 omitted — no taxonomy rows means unknown fit, not 0%.
    assert set(fits) == {"j1", "j2"}
    assert fits["j1"]["overlap_score"] == 50.0
    assert fits["j1"]["total_skills"] == 2  # python + rust
    assert fits["j2"]["overlap_score"] == 100.0
    assert fits["j2"]["matched_count"] == 2
    assert fits["j2"]["total_skills"] == 2
    assert "python" in fits["j2"]["matched_skills"]


def test_fit_batch_empty_ids_returns_empty():
    repo = _FakeRepo(_rows(), {"python": 3})
    _wire(repo)
    try:
        with TestClient(app) as client:
            res = client.post("/jobs/fit-batch", json={"job_ids": []})
    finally:
        _unwire()
    assert res.status_code == 200
    assert res.json() == {"fits": []}
    # No DB round-trip when there is nothing to score.
    assert repo.requested_ids is None


def test_fit_batch_rejects_oversized_request():
    repo = _FakeRepo(_rows(), {"python": 3})
    _wire(repo)
    try:
        with TestClient(app) as client:
            res = client.post(
                "/jobs/fit-batch",
                json={"job_ids": [f"j{i}" for i in range(FIT_BATCH_MAX + 1)]},
            )
    finally:
        _unwire()
    assert res.status_code == 422


def test_fit_batch_dedupes_ids():
    repo = _FakeRepo(_rows(), {"python": 3})
    _wire(repo)
    try:
        with TestClient(app) as client:
            res = client.post("/jobs/fit-batch", json={"job_ids": ["j1", "j1", "j2"]})
    finally:
        _unwire()
    assert res.status_code == 200
    ids = [f["job_id"] for f in res.json()["fits"]]
    assert ids.count("j1") == 1
    assert repo.requested_ids == ["j1", "j2"]
