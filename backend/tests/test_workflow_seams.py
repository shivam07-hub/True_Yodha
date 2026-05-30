from __future__ import annotations

import asyncio
import re
from datetime import date
from pathlib import Path
from typing import Any

from app.repositories.scores import ScoresRepository
from app.services import cv_workflow, jobs_workflow
from app.services.job_refresh import _dispatch


def test_router_modules_do_not_reference_repository_clients() -> None:
    routers_dir = Path(__file__).resolve().parents[1] / "app" / "routers"
    pattern = re.compile(r"\b[a-z_]*repo\.client\b")

    for router_file in routers_dir.rglob("*.py"):
        source = router_file.read_text(encoding="utf-8")
        assert pattern.search(source) is None, f"router leaked repository client seam: {router_file}"


class _FakeJobsRepository:
    def __init__(self) -> None:
        self.client = object()

    def get_user_skills_with_taxonomy(self, _user_id: str) -> list[dict[str, Any]]:
        return [
            {
                "matched_level": 2,
                "proficiency_title": "Trailblazer",
                "skills": {"taxonomy_key": "Python", "display_name": "Python"},
            }
        ]

    def get_all_jobs_skills(self) -> list[dict[str, Any]]:
        return [{"main_skills": ["Python"], "side_skills": []}]

    def get_user_target_roles(self, _user_id: str) -> list[str]:
        return ["Data Analyst"]


def test_jobs_workflow_uses_scores_repository_for_aspiration_lookup(monkeypatch: Any) -> None:
    captured: dict[str, Any] = {}

    def _fake_fetch_aspiration(scores_repo: ScoresRepository, target_roles: list[str]) -> dict[str, int]:
        captured["scores_repo"] = scores_repo
        captured["target_roles"] = target_roles
        return {"python": 3}

    monkeypatch.setattr(jobs_workflow, "fetch_aspiration_skills", _fake_fetch_aspiration)

    result = jobs_workflow.build_user_skill_demand(_FakeJobsRepository(), "user-1")

    assert isinstance(captured["scores_repo"], ScoresRepository)
    assert captured["target_roles"] == ["Data Analyst"]
    assert result[0]["skill"] == "Python"
    assert result[0]["needs_upgrade"] is True


class _FakeCVRepository:
    def __init__(self) -> None:
        self.client = object()
        self.updated_profile: dict[str, Any] | None = None
        self.created_spec: Any = None

    def find_by_content_hash(self, _user_id: str, _content_hash: str) -> None:
        return None  # always miss — force full pipeline in tests

    def update_cv_profile(self, _user_id: str, payload: dict[str, Any]) -> None:
        self.updated_profile = payload

    def create(self, _user_id: str, spec: Any) -> dict[str, Any]:
        self.created_spec = spec
        return {"id": 1}

    def count_user_skills(self, _user_id: str) -> int:
        return 1

    def get_current_score(self, _user_id: str) -> float | None:
        return 68.4


def test_cv_workflow_background_run_uses_scores_repository_for_scoring(monkeypatch: Any) -> None:
    """ADR-0004: scoring runs inside _run_cv_upload_job (background) with a fresh
    admin-scoped ScoresRepository. This validates the seam survives the 2-phase split.
    """
    repo = _FakeCVRepository()
    captured: dict[str, Any] = {}

    monkeypatch.setattr(cv_workflow, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(cv_workflow, "CVVersionsRepository", lambda _c: repo)
    monkeypatch.setattr(cv_workflow, "ScoresRepository", lambda _c: ScoresRepository(_c))

    async def _fake_parse_cv_text(_raw_text: str, provider=None) -> dict[str, Any]:
        return {
            "raw_text": _raw_text,
            "skills_detected": [{"taxonomy_key": "Python", "signal_type": "project", "xp_awarded": 150, "evidence": "Shipped APIs"}],
        }

    def _fake_record_cv_score(
        scores_repo: ScoresRepository,
        _user_id: str,
        _skills_detected: list[dict[str, Any]],
    ) -> dict[str, float]:
        captured["scores_repo"] = scores_repo
        return {"total_score": 68.4}

    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_text", _fake_parse_cv_text)
    monkeypatch.setattr(cv_workflow.scoring, "record_cv_score", _fake_record_cv_score)
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "mark_done", lambda *_a, **_k: None)
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "mark_failed", lambda *_a, **_k: None)
    async def _no_initial(_user_id): return None
    monkeypatch.setattr(cv_workflow, "_trigger_initial_match_compute", _no_initial)

    asyncio.run(
        cv_workflow._run_cv_upload_job(
            job_id="job-x", user_id="user-1",
            raw_text="Python backend engineer with shipped APIs.",
            content_hash="hash",
        )
    )

    assert isinstance(captured["scores_repo"], ScoresRepository)
    assert repo.updated_profile is not None
    assert repo.created_spec is not None
    assert repo.created_spec.kind == "baseline_upload"


class _FakeComputeJobsRepository:
    def __init__(self, candidate_job_ids: list[str]) -> None:
        self.client = object()
        self._candidate_job_ids = candidate_job_ids

    def get_user_skill_rows(self, _user_id: str) -> list[dict[str, Any]]:
        return [{"matched_level": 3, "skills": {"taxonomy_key": "Python (Programming Language)"}}]

    def get_user_profile_targeting(self, _user_id: str) -> dict[str, Any]:
        return {"target_roles": ["Data Analyst"], "target_location": "Remote"}

    def get_candidate_job_ids_for_skills(self, _skill_keys: list[str], *, target_location_country: str | None = None) -> list[str]:
        return self._candidate_job_ids

    def get_all_job_skill_rows(self, *, job_ids: list[str] | None = None) -> list[dict[str, Any]]:
        return [
            {"job_id": "job-1", "is_primary": True, "skills": {"taxonomy_key": "Python (Programming Language)"}},
            {"job_id": "job-2", "is_primary": True, "skills": {"taxonomy_key": "SQL (Programming Language)"}},
        ] if job_ids else []

    def get_jobs_by_ids(self, _job_ids: list[str]) -> list[dict[str, Any]]:
        return []


def test_compute_job_matches_includes_debug_on_cache_hit(monkeypatch: Any) -> None:
    repo = _FakeComputeJobsRepository(candidate_job_ids=["job-1"])

    monkeypatch.setattr(jobs_workflow.llm_ranker, "is_cache_valid", lambda *_args, **_kwargs: True)

    result = asyncio.run(jobs_workflow.compute_job_matches(repo, "user-1", date.today(), object()))  # type: ignore[arg-type]

    assert result.from_cache is True
    assert result.kind == "cache_hit"
    assert result.should_charge_xp is False
    assert result.debug["cache_hit"] is True
    assert result.debug["candidate_jobs_count"] is None


def test_compute_job_matches_force_bypasses_cache(monkeypatch: Any) -> None:
    """Paid Refresh (force=True) re-runs the brain even when a weekly cache exists."""
    repo = _FakeComputeJobsRepository(candidate_job_ids=["job-1", "job-2"])

    # Cache says "valid" — force must override and still compute.
    monkeypatch.setattr(jobs_workflow.llm_ranker, "is_cache_valid", lambda *_a, **_k: True)

    async def _fake_rank_and_persist(*_args: Any, **_kwargs: Any) -> int:
        return 2

    def _fake_get_top_matches(*_args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        kwargs["debug"].update({"min_skill_overlap": 2, "qualified_jobs_count": 2})
        return [
            {"job_id": "job-1", "overlap_score": 82.0, "matched_skills": ["Python (Programming Language)"]},
            {"job_id": "job-2", "overlap_score": 77.0, "matched_skills": ["SQL (Programming Language)"]},
        ]

    monkeypatch.setattr(jobs_workflow.job_matcher, "get_top_matches", _fake_get_top_matches)
    monkeypatch.setattr(jobs_workflow.llm_ranker, "rank_and_persist", _fake_rank_and_persist)

    result = asyncio.run(
        jobs_workflow.compute_job_matches(repo, "user-1", date.today(), object(), force=True)  # type: ignore[arg-type]
    )

    assert result.kind == "written"
    assert result.from_cache is False
    assert result.matches_written == 2


def test_compute_job_matches_includes_debug_when_no_candidates(monkeypatch: Any) -> None:
    repo = _FakeComputeJobsRepository(candidate_job_ids=[])

    monkeypatch.setattr(jobs_workflow.llm_ranker, "is_cache_valid", lambda *_args, **_kwargs: False)

    result = asyncio.run(jobs_workflow.compute_job_matches(repo, "user-1", date.today(), object()))  # type: ignore[arg-type]

    assert result.kind == "exhausted"
    assert result.exhausted is True
    assert result.needs_onboarding is False
    assert result.should_charge_xp is False
    assert result.debug["user_skills_count"] == 1
    assert result.debug["candidate_jobs_count"] == 0
    assert result.debug["top_jobs_count"] == 0


def test_compute_job_matches_includes_debug_on_success(monkeypatch: Any) -> None:
    repo = _FakeComputeJobsRepository(candidate_job_ids=["job-1", "job-2"])
    captured: dict[str, Any] = {}

    async def _fake_rank_and_persist(*_args: Any, **_kwargs: Any) -> int:
        return 2

    monkeypatch.setattr(jobs_workflow.llm_ranker, "is_cache_valid", lambda *_args, **_kwargs: False)

    def _fake_get_top_matches(*_args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        captured["top_n"] = kwargs.get("top_n")
        kwargs["debug"].update({"min_skill_overlap": 2, "qualified_jobs_count": 2})
        return [
            {"job_id": "job-1", "overlap_score": 82.0, "matched_skills": ["Python (Programming Language)"]},
            {"job_id": "job-2", "overlap_score": 77.0, "matched_skills": ["SQL (Programming Language)"]},
        ]

    monkeypatch.setattr(jobs_workflow.job_matcher, "get_top_matches", _fake_get_top_matches)
    monkeypatch.setattr(jobs_workflow.llm_ranker, "rank_and_persist", _fake_rank_and_persist)

    result = asyncio.run(jobs_workflow.compute_job_matches(repo, "user-1", date.today(), object()))  # type: ignore[arg-type]

    assert result.kind == "written"
    assert result.matches_written == 2
    assert result.should_charge_xp is True
    assert result.debug["user_skills_count"] == 1
    assert result.debug["candidate_jobs_count"] == 2
    assert result.debug["top_jobs_count"] == 2
    assert result.debug["min_skill_overlap"] == 2
    assert result.debug["qualified_jobs_count"] == 2
    assert captured["top_n"] == 12


def test_compute_job_matches_relaxes_exclusion_when_pool_emptied(monkeypatch: Any) -> None:
    """Backlog #14: when prior matches exclude the whole pool, a paid refresh
    re-ranks the full pool instead of refunding (XP is the only gate)."""
    repo = _FakeComputeJobsRepository(candidate_job_ids=["job-1", "job-2"])

    monkeypatch.setattr(jobs_workflow.llm_ranker, "is_cache_valid", lambda *_a, **_k: False)

    async def _fake_rank_and_persist(*_a: Any, **_k: Any) -> int:
        return 2

    def _fake_get_top_matches(*_a: Any, **kwargs: Any) -> list[dict[str, Any]]:
        kwargs["debug"].update({"min_skill_overlap": 2, "qualified_jobs_count": 2})
        return [
            {"job_id": "job-1", "overlap_score": 82.0, "matched_skills": ["Python (Programming Language)"]},
            {"job_id": "job-2", "overlap_score": 77.0, "matched_skills": ["SQL (Programming Language)"]},
        ]

    monkeypatch.setattr(jobs_workflow.job_matcher, "get_top_matches", _fake_get_top_matches)
    monkeypatch.setattr(jobs_workflow.llm_ranker, "rank_and_persist", _fake_rank_and_persist)

    # Every candidate already matched → exclusion would empty the pool.
    result = asyncio.run(
        jobs_workflow.compute_job_matches(
            repo, "user-1", date.today(), object(),  # type: ignore[arg-type]
            excluded_job_ids=["job-1", "job-2"], force=True,
        )
    )

    assert result.kind == "written"  # not "exhausted" — relaxed to full pool
    assert result.should_charge_xp is True
    assert result.debug["exclusion_relaxed"] == 1
    assert result.debug["candidate_jobs_count"] == 2


def test_compute_job_matches_exhausted_only_on_zero_overlap(monkeypatch: Any) -> None:
    """A genuinely empty candidate pool (no skill overlap at all) still
    refunds — the only honest exhausted case."""
    repo = _FakeComputeJobsRepository(candidate_job_ids=[])
    monkeypatch.setattr(jobs_workflow.llm_ranker, "is_cache_valid", lambda *_a, **_k: False)

    result = asyncio.run(
        jobs_workflow.compute_job_matches(
            repo, "user-1", date.today(), object(),  # type: ignore[arg-type]
            excluded_job_ids=["job-9"], force=True,
        )
    )

    assert result.kind == "exhausted"
    assert result.should_charge_xp is False
    assert result.debug["exclusion_relaxed"] == 1


def test_refresh_state_carries_match_outcome_kind() -> None:
    state = _dispatch._state(
        "ticket-1",
        "done",
        date(2026, 5, 25),
        matches_written=0,
        outcome_kind="exhausted",
    )

    assert state.outcome_kind == "exhausted"
