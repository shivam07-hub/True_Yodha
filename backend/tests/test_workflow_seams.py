from __future__ import annotations

import asyncio
import re
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
        self.inserted_history: dict[str, Any] | None = None

    def update_cv_profile(self, _user_id: str, payload: dict[str, Any]) -> None:
        self.updated_profile = payload

    def insert_cv_history(self, payload: dict[str, Any]) -> None:
        self.inserted_history = payload

    def next_version_number(self, _user_id: str) -> int:
        return 2


def test_cv_workflow_ingest_uses_scores_repository_for_scoring(monkeypatch: Any) -> None:
    repo = _FakeCVRepository()
    captured: dict[str, Any] = {}

    async def _fake_parse_cv(_file_bytes: bytes, _file_type: str) -> dict[str, Any]:
        return {
            "raw_text": "Python backend engineer with shipped APIs.",
            "skills_detected": [{"taxonomy_key": "Python", "signal_type": "project", "xp_awarded": 150, "evidence": "Shipped APIs"}],
        }

    def _fake_compute_and_persist_score(
        scores_repo: ScoresRepository,
        _user_id: str,
        _skills_detected: list[dict[str, Any]],
        **kwargs: Any,
    ) -> dict[str, float]:
        captured["scores_repo"] = scores_repo
        captured["kwargs"] = kwargs
        return {"total_score": 68.4}

    monkeypatch.setattr(cv_workflow, "assert_not_rate_limited", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv", _fake_parse_cv)
    monkeypatch.setattr(
        cv_workflow.scoring_engine,
        "compute_and_persist_score",
        _fake_compute_and_persist_score,
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
    assert captured["kwargs"]["include_market_signals"] is False
    assert captured["kwargs"]["require_skills_assessed"] is True
    assert repo.updated_profile is not None
    assert repo.inserted_history is not None
    assert result["score"] == 68.4
