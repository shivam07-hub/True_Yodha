from __future__ import annotations

import asyncio
import re
from datetime import date
from pathlib import Path
from typing import Any

from app.repositories.scores import ScoresRepository
from app.services import cv_workflow, jobs_workflow


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


def test_cv_workflow_ingest_uses_scores_repository_for_scoring(monkeypatch: Any) -> None:
    repo = _FakeCVRepository()
    captured: dict[str, Any] = {}

    _raw = "Python backend engineer with shipped APIs."
    monkeypatch.setattr(cv_workflow.cv_parser, "extract_raw_text", lambda *_a, **_k: _raw)

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

    async def _noop_welcome_xp(_user_id: str) -> int:
        return 1000

    monkeypatch.setattr(cv_workflow, "assert_not_rate_limited", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(cv_workflow, "grant_welcome_xp", _noop_welcome_xp)
    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_text", _fake_parse_cv_text)
    monkeypatch.setattr(
        cv_workflow.scoring,
        "record_cv_score",
        _fake_record_cv_score,
    )

    result = asyncio.run(
        cv_workflow.ingest_uploaded_cv(
            repo,
            "user-1",
            file_bytes=b"%PDF-1.7 ...",
            file_type="application/pdf",
        )
    )

    assert isinstance(captured["scores_repo"], ScoresRepository)
    assert repo.updated_profile is not None
    assert repo.created_spec is not None
    assert repo.created_spec.kind == "baseline_upload"
    assert result["score"] == 68.4


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

    monkeypatch.setattr(jobs_workflow, "assert_not_rate_limited", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(jobs_workflow.llm_ranker, "is_cache_valid", lambda *_args, **_kwargs: True)

    result = asyncio.run(jobs_workflow.compute_job_matches(repo, "user-1", date.today(), object()))  # type: ignore[arg-type]

    assert result["from_cache"] is True
    assert result["debug"]["cache_hit"] is True
    assert result["debug"]["candidate_jobs_count"] is None


def test_compute_job_matches_includes_debug_when_no_candidates(monkeypatch: Any) -> None:
    repo = _FakeComputeJobsRepository(candidate_job_ids=[])

    monkeypatch.setattr(jobs_workflow, "assert_not_rate_limited", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(jobs_workflow.llm_ranker, "is_cache_valid", lambda *_args, **_kwargs: False)

    result = asyncio.run(jobs_workflow.compute_job_matches(repo, "user-1", date.today(), object()))  # type: ignore[arg-type]

    assert result["from_cache"] is False
    assert result["needs_onboarding"] is False
    assert result["debug"]["user_skills_count"] == 1
    assert result["debug"]["candidate_jobs_count"] == 0
    assert result["debug"]["top_jobs_count"] == 0


def test_compute_job_matches_includes_debug_on_success(monkeypatch: Any) -> None:
    repo = _FakeComputeJobsRepository(candidate_job_ids=["job-1", "job-2"])

    async def _fake_rank_and_persist(*_args: Any, **_kwargs: Any) -> int:
        return 2

    monkeypatch.setattr(jobs_workflow, "assert_not_rate_limited", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(jobs_workflow.llm_ranker, "is_cache_valid", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(jobs_workflow.job_matcher, "get_top_matches", lambda *_args, **_kwargs: [
        {"job_id": "job-1", "overlap_score": 82.0, "matched_skills": ["Python (Programming Language)"]},
        {"job_id": "job-2", "overlap_score": 77.0, "matched_skills": ["SQL (Programming Language)"]},
    ])
    monkeypatch.setattr(jobs_workflow.llm_ranker, "rank_and_persist", _fake_rank_and_persist)

    result = asyncio.run(jobs_workflow.compute_job_matches(repo, "user-1", date.today(), object()))  # type: ignore[arg-type]

    assert result["matches_written"] == 2
    assert result["debug"]["user_skills_count"] == 1
    assert result["debug"]["candidate_jobs_count"] == 2
    assert result["debug"]["top_jobs_count"] == 2
