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
        triage_keep=over.get("triage_keep"),
        eval_cache_fetcher=over.get("eval_cache_fetcher"),
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


def _five_top_jobs() -> list[dict[str, Any]]:
    return [
        {"job_id": f"j{i}", "overlap_score": 90.0 - i, "matched_skills": ["python"]}
        for i in range(5)
    ]


def test_rank_triage_narrows_pool_before_brain(monkeypatch: Any) -> None:
    """Two-tier brain: the cheap triage picks the shortlist out of the pool, and
    only that shortlist reaches the expensive per-job eval + persistence."""
    monkeypatch.setattr(ranking.job_matcher, "get_top_matches", lambda *_a, **_k: _five_top_jobs())

    async def _triage(_profile: Any, pool: list[dict[str, Any]], _prov: Any, keep_n: int) -> list[dict[str, Any]]:
        assert len(pool) == 5 and keep_n == 2
        return [pool[3], pool[1]]  # brain reorders + narrows

    captured: dict[str, Any] = {}

    async def _brain(_profile: Any, jobs: list[dict[str, Any]], _prov: Any, _cb: Any) -> dict[str, Any]:
        captured["ids"] = [j["job_id"] for j in jobs]
        return {j["job_id"]: {"overall_score": 4.0} for j in jobs}

    monkeypatch.setattr(ranking.llm_ranker, "triage_shortlist", _triage)
    monkeypatch.setattr(ranking.llm_ranker, "evaluate_all", _brain)

    debug: dict[str, int] = {}
    result = asyncio.run(
        ranking.rank(
            {"target_roles": ["PM"]}, "cv",
            _candidates(top_n=60, triage_keep=2),
            provider=object(), use_brain=True, debug=debug,  # type: ignore[arg-type]
        )
    )

    assert captured["ids"] == ["j3", "j1"]  # only the triaged shortlist evaluated
    assert [j["job_id"] for j in result.top_jobs] == ["j3", "j1"]  # persisted set = shortlist
    assert debug["triage_pool"] == 5 and debug["triage_kept"] == 2


def test_rank_no_triage_when_keep_none(monkeypatch: Any) -> None:
    monkeypatch.setattr(ranking.job_matcher, "get_top_matches", lambda *_a, **_k: _five_top_jobs())

    async def _boom(*_a: Any, **_k: Any) -> list[dict[str, Any]]:
        raise AssertionError("triage must not run when triage_keep is None")

    monkeypatch.setattr(ranking.llm_ranker, "triage_shortlist", _boom)
    monkeypatch.setattr(ranking.llm_ranker, "evaluate_all",
                        lambda *_a, **_k: _async_ret({}))

    result = asyncio.run(ranking.rank({}, "cv", _candidates(top_n=60), provider=object()))  # type: ignore[arg-type]
    assert len(result.top_jobs) == 5  # untouched — every pool job flows to brain


async def _async_ret(value: Any) -> Any:
    return value


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


def test_rank_reuses_cached_eval_never_calls_brain_for_it(monkeypatch: Any) -> None:
    """Backlog #36: a job already evaluated for this user (permanent per-(user,
    job) identity) is NEVER re-sent to the LLM — its cached row is reused as-is,
    only the genuinely uncached job reaches evaluate_all."""
    monkeypatch.setattr(ranking.job_matcher, "get_top_matches", lambda *_a, **_k: _two_top_jobs())
    captured: dict[str, Any] = {}

    async def _brain(_profile: Any, jobs: list[dict[str, Any]], _prov: Any, _cb: Any) -> dict[str, Any]:
        captured["ids"] = [j["job_id"] for j in jobs]
        return {j["job_id"]: {"overall_score": 9.0} for j in jobs}

    monkeypatch.setattr(ranking.llm_ranker, "evaluate_all", _brain)

    def _cache_fetcher(job_ids: list[str]) -> dict[str, dict[str, Any]]:
        assert set(job_ids) == {"j1", "j2"}
        return {"j1": {"overall_score": 4.2, "grade": "B"}}  # j1 already rated

    result = asyncio.run(
        ranking.rank(
            {}, "cv", _candidates(eval_cache_fetcher=_cache_fetcher), provider=object(), use_brain=True  # type: ignore[arg-type]
        )
    )

    assert captured["ids"] == ["j2"]  # only the uncached job reached the brain
    assert result.evaluations["j1"] == {"overall_score": 4.2, "grade": "B"}  # cached row reused verbatim
    assert result.evaluations["j2"]["overall_score"] == 9.0


def test_rank_ignores_cached_row_with_no_verdict(monkeypatch: Any) -> None:
    """A cached row with overall_score=None (brain never actually ran on it —
    e.g. a stale overlap-only row) does not count as 'already evaluated'."""
    monkeypatch.setattr(ranking.job_matcher, "get_top_matches", lambda *_a, **_k: _two_top_jobs())
    captured: dict[str, Any] = {}

    async def _brain(_profile: Any, jobs: list[dict[str, Any]], _prov: Any, _cb: Any) -> dict[str, Any]:
        captured["ids"] = [j["job_id"] for j in jobs]
        return {}

    monkeypatch.setattr(ranking.llm_ranker, "evaluate_all", _brain)

    def _cache_fetcher(_job_ids: list[str]) -> dict[str, dict[str, Any]]:
        return {"j1": {"overall_score": None}}

    asyncio.run(
        ranking.rank(
            {}, "cv", _candidates(eval_cache_fetcher=_cache_fetcher), provider=object(), use_brain=True  # type: ignore[arg-type]
        )
    )

    assert set(captured["ids"]) == {"j1", "j2"}  # both still reach the brain


def test_rank_no_cache_fetcher_evaluates_everything(monkeypatch: Any) -> None:
    """Callers that omit eval_cache_fetcher (e.g. rank_one's caller) get the old
    always-eval behaviour — back-compat, no cache lookup attempted."""
    monkeypatch.setattr(ranking.job_matcher, "get_top_matches", lambda *_a, **_k: _two_top_jobs())
    captured: dict[str, Any] = {}

    async def _brain(_profile: Any, jobs: list[dict[str, Any]], _prov: Any, _cb: Any) -> dict[str, Any]:
        captured["ids"] = [j["job_id"] for j in jobs]
        return {}

    monkeypatch.setattr(ranking.llm_ranker, "evaluate_all", _brain)

    asyncio.run(ranking.rank({}, "cv", _candidates(), provider=object(), use_brain=True))  # type: ignore[arg-type]

    assert set(captured["ids"]) == {"j1", "j2"}


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
