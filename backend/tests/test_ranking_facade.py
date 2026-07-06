"""Consolidation B — the JobRanking facade (services/matching/ranking.py).

Guards that ``rank`` is a thin, faithful orchestration of the two tuned stages
(deterministic overlap + brain) and that the cost/skip knobs behave, plus that
``rank_one`` is a single-job brain delegate.
"""
from __future__ import annotations

import asyncio
from typing import Any

from app.services.matching import ranking


def _candidates(**over: Any) -> ranking.RankCandidates:
    return ranking.RankCandidates(
        job_skill_rows=over.get("rows", [{"job_id": "j1"}]),
        user_skill_map=over.get("skills", {"python": 3}),
        job_meta_fetcher=over.get("fetch", lambda _ids: []),
        top_n=over.get("top_n", 12),
    )


def _two_top_jobs() -> list[dict[str, Any]]:
    return [
        {"job_id": "j1", "overlap_score": 82.0, "matched_skills": ["python"]},
        {"job_id": "j2", "overlap_score": 71.0, "matched_skills": ["sql"]},
    ]


def test_rank_deterministic_only_skips_brain(monkeypatch: Any) -> None:
    monkeypatch.setattr(ranking.job_matcher, "get_top_matches", lambda *_a, **_k: _two_top_jobs())

    called = {"brain": False}

    async def _no_brain(*_a: Any, **_k: Any) -> dict[str, Any]:
        called["brain"] = True
        return {"j1": {"overall_score": 4.0}}

    monkeypatch.setattr(ranking.llm_ranker, "evaluate_all", _no_brain)

    # use_brain=False → deterministic scores only, brain never touched.
    result = asyncio.run(
        ranking.rank({"target_roles": ["PM"]}, "cv", _candidates(), provider=object(), use_brain=False)  # type: ignore[arg-type]
    )

    assert [j["job_id"] for j in result.top_jobs] == ["j1", "j2"]
    assert result.evaluations == {}
    assert called["brain"] is False


def test_rank_no_provider_skips_brain(monkeypatch: Any) -> None:
    monkeypatch.setattr(ranking.job_matcher, "get_top_matches", lambda *_a, **_k: _two_top_jobs())
    result = asyncio.run(ranking.rank({}, "cv", _candidates(), provider=None, use_brain=True))
    assert result.evaluations == {}


def test_rank_empty_shortlist_never_calls_brain(monkeypatch: Any) -> None:
    monkeypatch.setattr(ranking.job_matcher, "get_top_matches", lambda *_a, **_k: [])

    async def _boom(*_a: Any, **_k: Any) -> dict[str, Any]:
        raise AssertionError("brain must not run on an empty shortlist")

    monkeypatch.setattr(ranking.llm_ranker, "evaluate_all", _boom)

    result = asyncio.run(ranking.rank({}, "cv", _candidates(), provider=object(), use_brain=True))  # type: ignore[arg-type]
    assert result.top_jobs == []
    assert result.evaluations == {}


def test_rank_runs_brain_and_returns_evals(monkeypatch: Any) -> None:
    monkeypatch.setattr(ranking.job_matcher, "get_top_matches", lambda *_a, **_k: _two_top_jobs())
    captured: dict[str, Any] = {}

    async def _brain(profile: dict[str, Any], jobs: list[dict[str, Any]], _prov: Any, _cb: Any) -> dict[str, Any]:
        captured["cv"] = profile.get("cv_markdown")
        captured["n"] = len(jobs)
        return {j["job_id"]: {"overall_score": 4.2} for j in jobs}

    monkeypatch.setattr(ranking.llm_ranker, "evaluate_all", _brain)

    result = asyncio.run(
        ranking.rank({"target_roles": ["PM"]}, "MY CV", _candidates(), provider=object(), use_brain=True)  # type: ignore[arg-type]
    )

    assert captured["cv"] == "MY CV"  # explicit cv wins
    assert captured["n"] == 2
    assert set(result.evaluations) == {"j1", "j2"}


def test_rank_budget_caps_brain_jobs(monkeypatch: Any) -> None:
    monkeypatch.setattr(ranking.job_matcher, "get_top_matches", lambda *_a, **_k: _two_top_jobs())
    captured: dict[str, Any] = {}

    async def _brain(_profile: Any, jobs: list[dict[str, Any]], _prov: Any, _cb: Any) -> dict[str, Any]:
        captured["ids"] = [j["job_id"] for j in jobs]
        return {}

    monkeypatch.setattr(ranking.llm_ranker, "evaluate_all", _brain)

    asyncio.run(ranking.rank({}, "cv", _candidates(), provider=object(), budget=1))  # type: ignore[arg-type]
    # Only the top job reaches the brain — but all top_jobs still returned.
    assert captured["ids"] == ["j1"]


def test_rank_falls_back_to_profile_cv(monkeypatch: Any) -> None:
    monkeypatch.setattr(ranking.job_matcher, "get_top_matches", lambda *_a, **_k: _two_top_jobs())
    captured: dict[str, Any] = {}

    async def _brain(profile: dict[str, Any], _jobs: Any, _prov: Any, _cb: Any) -> dict[str, Any]:
        captured["cv"] = profile.get("cv_markdown")
        return {}

    monkeypatch.setattr(ranking.llm_ranker, "evaluate_all", _brain)

    # Empty explicit cv → the facade falls back to profile["cv_markdown"].
    asyncio.run(ranking.rank({"cv_markdown": "PROFILE CV"}, "", _candidates(), provider=object()))  # type: ignore[arg-type]
    assert captured["cv"] == "PROFILE CV"


def test_rank_one_delegates_to_evaluate_job(monkeypatch: Any) -> None:
    captured: dict[str, Any] = {}

    def _fake_prompt(profile: dict[str, Any], cv: str) -> str:
        captured["cv"] = cv
        return "SYS"

    async def _fake_eval(job: dict[str, Any], system_prompt: str, _prov: Any) -> dict[str, Any]:
        captured["job"] = job["job_id"]
        captured["prompt"] = system_prompt
        return {"overall_score": 3.9, "grade": "B+"}

    monkeypatch.setattr(ranking.llm_ranker, "build_system_prompt", _fake_prompt)
    monkeypatch.setattr(ranking.llm_ranker, "evaluate_job", _fake_eval)

    out = asyncio.run(
        ranking.rank_one({"target_roles": ["PM"]}, "CV TEXT", {"job_id": "jX"}, provider=object())  # type: ignore[arg-type]
    )

    assert out == {"overall_score": 3.9, "grade": "B+"}
    assert captured == {"cv": "CV TEXT", "job": "jX", "prompt": "SYS"}
