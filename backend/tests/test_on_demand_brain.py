"""Consolidation D — brain-everywhere (services/matching/on_demand.py).

Guards the on-demand single-job brain: idempotent cache hit (no LLM), fresh
compute + single-row persist with is_recommended=False, and graceful None when the
job is gone / the brain fails.
"""
from __future__ import annotations

import asyncio
from typing import Any

from app.services.matching import on_demand


class _FakeRepo:
    def __init__(self, *, cached: dict[str, Any] | None = None, job_exists: bool = True) -> None:
        self._cached = cached
        self._job_exists = job_exists
        self.persisted: dict[str, Any] | None = None

    def get_cached_match_evals(self, _uid: str, job_ids: list[str], *, full: bool = False) -> dict[str, Any]:
        return {job_ids[0]: self._cached} if self._cached else {}

    def get_jobs_by_ids(self, job_ids: list[str]) -> list[dict[str, Any]]:
        if not self._job_exists:
            return []
        return [{"job_id": job_ids[0], "job_title": "MLE", "company_name": "Acme",
                 "industry": "AI", "location": "Remote", "job_description": "Build models."}]

    def get_all_job_skill_rows(self, *, job_ids: list[str] | None = None) -> list[dict[str, Any]]:
        return [
            {"job_id": job_ids[0], "is_primary": True, "skills": {"taxonomy_key": "Python"}},
            {"job_id": job_ids[0], "is_primary": False, "skills": {"taxonomy_key": "Rust"}},
        ]

    def get_user_skill_rows(self, _uid: str) -> list[dict[str, Any]]:
        return [{"matched_level": 3, "skills": {"taxonomy_key": "Python"}}]

    def get_user_profile_targeting(self, _uid: str) -> dict[str, Any]:
        return {"target_roles": ["MLE"], "cv_markdown": "CV"}

    def get_latest_baseline_id(self, _uid: str) -> int | None:
        return 7

    def upsert_single_match_eval(self, _uid: str, row: dict[str, Any]) -> None:
        self.persisted = row


def test_cache_hit_returns_without_llm(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached={"overall_score": 4.1, "grade": "A", "summary": "great", "strengths": None})

    async def _boom(*_a: Any, **_k: Any) -> Any:
        raise AssertionError("cached hit must not call the brain")

    monkeypatch.setattr(on_demand.ranking, "rank_one", _boom)

    out = asyncio.run(on_demand.ensure_job_eval(repo, object(), "u1", "j1"))  # type: ignore[arg-type]
    assert out["cached"] is True
    assert out["grade"] == "A"
    assert out["strengths"] == []  # NULL column coerced to a list
    assert repo.persisted is None  # cache hit never writes


def test_fresh_compute_persists_unrecommended(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=None)

    async def _fake_rank_one(profile: dict[str, Any], cv: str, job: dict[str, Any], _prov: Any) -> dict[str, Any]:
        assert cv == "CV"
        assert job["matched_skills"] == ["Python"]  # deterministic overlap computed
        return {"overall_score": 3.8, "grade": "B+", "recommendation": "Apply",
                "summary": "solid", "strengths": ["x"], "concerns": []}

    monkeypatch.setattr(on_demand.ranking, "rank_one", _fake_rank_one)

    out = asyncio.run(on_demand.ensure_job_eval(repo, object(), "u1", "j1"))  # type: ignore[arg-type]
    assert out["cached"] is False
    assert out["grade"] == "B+"
    # A single row was written, never promoted into the recommended set.
    assert repo.persisted is not None
    assert repo.persisted["is_recommended"] is False
    assert repo.persisted["job_id"] == "j1"
    assert repo.persisted["baseline_version_id"] == 7
    assert repo.persisted["overall_score"] == 3.8


def test_missing_job_returns_none(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=None, job_exists=False)
    out = asyncio.run(on_demand.ensure_job_eval(repo, object(), "u1", "gone"))  # type: ignore[arg-type]
    assert out is None
    assert repo.persisted is None


def test_brain_failure_returns_none_no_persist(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=None)

    async def _fail(*_a: Any, **_k: Any) -> None:
        return None

    monkeypatch.setattr(on_demand.ranking, "rank_one", _fail)

    out = asyncio.run(on_demand.ensure_job_eval(repo, object(), "u1", "j1"))  # type: ignore[arg-type]
    assert out is None
    assert repo.persisted is None  # no brain-less row written


def test_overlap_only_cache_recomputes(monkeypatch: Any) -> None:
    # A row exists but the brain never ran (overall_score is None) → recompute.
    repo = _FakeRepo(cached={"overall_score": None, "grade": None})

    async def _fake_rank_one(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {"overall_score": 4.0, "grade": "A", "recommendation": "Apply"}

    monkeypatch.setattr(on_demand.ranking, "rank_one", _fake_rank_one)

    out = asyncio.run(on_demand.ensure_job_eval(repo, object(), "u1", "j1"))  # type: ignore[arg-type]
    assert out["cached"] is False
    assert repo.persisted is not None


# ── the Targeting Brief reaches the on-open brain ────────────────────────────
#
# A verdict written here is cached permanently per (user, job) — migration
# 20260710 — so reading raw `user_profiles` columns would make every fact the
# user has told Myro invisible to it forever. 70% of the brain verdicts in prod
# (1,175 rows) were written memory-blind through this path and the feed warmer
# before the brief was wired in.

def test_brain_sees_memory_facts_via_targeting_brief(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=None)
    monkeypatch.setattr(
        on_demand.targeting,
        "_facts",
        lambda _db, _uid: [on_demand.targeting.MemoryFact(kind="constraint", text="no night shifts")],
    )
    seen: dict[str, Any] = {}

    async def _capture(profile: dict[str, Any], _cv: str, _job: dict[str, Any], _prov: Any) -> dict[str, Any]:
        seen.update(profile)
        return {"overall_score": 3.8, "grade": "B+", "recommendation": "Apply",
                "summary": "s", "strengths": [], "concerns": []}

    monkeypatch.setattr(on_demand.ranking, "rank_one", _capture)
    asyncio.run(on_demand.ensure_job_eval(repo, object(), "u1", "j1"))  # type: ignore[arg-type]

    assert seen["known_facts"] == ["constraint: no night shifts"]
    assert seen["target_roles"] == ["MLE"]  # columns still pass through untouched


def test_no_memory_is_not_an_error(monkeypatch: Any) -> None:
    """A user with zero facts must rank exactly as before — memory is additive."""
    repo = _FakeRepo(cached=None)
    seen: dict[str, Any] = {}

    async def _capture(profile: dict[str, Any], _cv: str, _job: dict[str, Any], _prov: Any) -> dict[str, Any]:
        seen.update(profile)
        return {"overall_score": 3.0, "grade": "B", "recommendation": "Apply",
                "summary": "s", "strengths": [], "concerns": []}

    monkeypatch.setattr(on_demand.ranking, "rank_one", _capture)
    asyncio.run(on_demand.ensure_job_eval(repo, object(), "u1", "j1"))  # type: ignore[arg-type]

    assert "known_facts" not in seen
