"""The "best jobs" rule — services/matching/feed_warm.py.

Guards the feed shortlist warmer: it brain-ranks the fit-top candidates that
aren't cached yet in ONE batched pass, persists each with is_recommended=False
(so a warmed feed pick never floods the dashboard top-3), skips already-cached
candidates (idempotent / cost-free re-warm), respects the shortlist cap, and
fails soft to 0 when the brain returns nothing.
"""
from __future__ import annotations

import asyncio
from typing import Any

from app.services.matching import feed_warm
from app.services.onboarding_service import eval_context_key

# The key the code derives for _FakeRepo's profile (baseline 7, no memory — the
# fake has no `_db`, so the Targeting Brief carries no facts).
_CTX = eval_context_key({"baseline_version_id": 7})


class _FakeRepo:
    def __init__(self, *, cached: set[str] | None = None, cached_ctx: str | None = _CTX) -> None:
        self._cached = cached or set()
        self._cached_ctx = cached_ctx
        self.persisted: list[dict[str, Any]] = []

    def get_cached_match_evals(self, _uid: str, job_ids: list[str], *, full: bool = False) -> dict[str, Any]:
        # A cached row records WHICH targeting context produced it; without that the
        # skip gate cannot tell a live verdict from a superseded one.
        return {
            j: {"overall_score": 4.0, "eval_context_hash": self._cached_ctx}
            for j in job_ids if j in self._cached
        }

    def get_jobs_by_ids(self, job_ids: list[str]) -> list[dict[str, Any]]:
        return [
            {"job_id": j, "job_title": f"Role {j}", "company_name": "Acme",
             "industry": "AI", "location": "Remote", "job_description": "Build."}
            for j in job_ids
        ]

    def get_all_job_skill_rows(self, *, job_ids: list[str] | None = None) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for j in job_ids or []:
            rows.append({"job_id": j, "is_primary": True, "skills": {"taxonomy_key": "Python"}})
            rows.append({"job_id": j, "is_primary": False, "skills": {"taxonomy_key": "Rust"}})
        return rows

    def get_user_skill_rows(self, _uid: str) -> list[dict[str, Any]]:
        return [{"matched_level": 3, "skills": {"taxonomy_key": "Python"}}]

    def get_user_profile_targeting(self, _uid: str) -> dict[str, Any]:
        return {"target_roles": ["MLE"], "cv_markdown": "CV"}

    def get_latest_baseline_id(self, _uid: str) -> int | None:
        return 7

    def upsert_single_match_eval(self, _uid: str, row: dict[str, Any]) -> None:
        self.persisted.append(row)


def _fake_evaluate_all(monkeypatch: Any, scores: dict[str, float] | None = None) -> None:
    async def _eval_all(_profile: dict[str, Any], jobs: list[dict[str, Any]], _prov: Any, _cb: Any = None) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for job in jobs:
            jid = job["job_id"]
            out[jid] = {"overall_score": (scores or {}).get(jid, 4.0), "grade": "A",
                        "recommendation": "Apply", "summary": "solid", "strengths": [], "concerns": []}
        return out

    monkeypatch.setattr(feed_warm.llm_ranker, "evaluate_all", _eval_all)


def test_warms_uncached_candidates_and_persists_unrecommended(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=set())
    _fake_evaluate_all(monkeypatch)

    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a", "b", "c"]))  # type: ignore[arg-type]
    assert warmed == 3
    assert len(repo.persisted) == 3
    assert all(row["is_recommended"] is False for row in repo.persisted)
    assert {row["job_id"] for row in repo.persisted} == {"a", "b", "c"}
    assert all(row["baseline_version_id"] == 7 for row in repo.persisted)


def test_already_cached_candidates_are_skipped(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached={"a", "b"})

    async def _boom(*_a: Any, **_k: Any) -> Any:
        raise AssertionError("fully-cached shortlist must not call the brain")

    monkeypatch.setattr(feed_warm.llm_ranker, "evaluate_all", _boom)

    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a", "b"]))  # type: ignore[arg-type]
    assert warmed == 0
    assert repo.persisted == []


def test_only_uncached_reach_the_brain(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached={"a"})
    seen: list[str] = []

    async def _eval_all(_p: dict[str, Any], jobs: list[dict[str, Any]], _prov: Any, _cb: Any = None) -> dict[str, Any]:
        seen.extend(j["job_id"] for j in jobs)
        return {j["job_id"]: {"overall_score": 4.0, "recommendation": "Apply"} for j in jobs}

    monkeypatch.setattr(feed_warm.llm_ranker, "evaluate_all", _eval_all)

    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a", "b", "c"]))  # type: ignore[arg-type]
    assert warmed == 2
    assert set(seen) == {"b", "c"}  # 'a' was cached — never re-evaluated


def test_shortlist_cap_bounds_the_warm(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=set())
    _fake_evaluate_all(monkeypatch)
    candidates = [str(i) for i in range(50)]

    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", candidates, limit=10))  # type: ignore[arg-type]
    assert warmed == 10  # only the top 10 are warmed, not all 50


def test_empty_brain_result_persists_nothing(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=set())

    async def _eval_all(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {}

    monkeypatch.setattr(feed_warm.llm_ranker, "evaluate_all", _eval_all)

    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a", "b"]))  # type: ignore[arg-type]
    assert warmed == 0
    assert repo.persisted == []


def test_no_candidates_is_a_noop() -> None:
    repo = _FakeRepo()
    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", []))  # type: ignore[arg-type]
    assert warmed == 0


# ── the Targeting Brief reaches the warmer ───────────────────────────────────
#
# Same contract as on_demand: these evals persist permanently per (user, job),
# so a memory-blind one here is a memory-blind verdict forever.

def test_warm_sees_memory_facts_via_targeting_brief(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=set())
    monkeypatch.setattr(
        feed_warm.targeting,
        "_facts",
        lambda _db, _uid: [feed_warm.targeting.MemoryFact(kind="aspiration", text="move into platform work")],
    )
    seen: dict[str, Any] = {}

    async def _capture(profile: dict[str, Any], jobs: list[dict[str, Any]], _prov: Any, _cb: Any = None) -> dict[str, Any]:
        seen.update(profile)
        return {j["job_id"]: {"overall_score": 4.0, "grade": "A", "recommendation": "Apply",
                             "summary": "s", "strengths": [], "concerns": []} for j in jobs}

    monkeypatch.setattr(feed_warm.llm_ranker, "evaluate_all", _capture)
    asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a"]))  # type: ignore[arg-type]

    assert seen["known_facts"] == ["aspiration: move into platform work"]
    assert seen["cv_markdown"] == "CV"  # _eval_profile still resolves the CV


# ── the warm re-rates across a context change, and stays free within one ────────

def test_a_shortlist_cached_under_a_superseded_context_is_re_warmed(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached={"a", "b", "c"}, cached_ctx="a-context-we-have-moved-past")
    _fake_evaluate_all(monkeypatch)
    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a", "b", "c"]))  # type: ignore[arg-type]
    assert warmed == 3
    assert all(row["eval_context_hash"] == _CTX for row in repo.persisted)


def test_a_shortlist_cached_under_the_current_context_still_costs_nothing(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached={"a", "b", "c"})

    async def _boom(*_a: Any, **_k: Any) -> Any:
        raise AssertionError("a current-context shortlist must not call the brain")

    monkeypatch.setattr(feed_warm.llm_ranker, "evaluate_all", _boom)
    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a", "b", "c"]))  # type: ignore[arg-type]
    assert warmed == 0
    assert repo.persisted == []
