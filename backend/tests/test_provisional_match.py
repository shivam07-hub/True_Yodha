"""A Provisional Match: the shortlist is visible before the brain has scored it.

Measured 2026-08-04: `target_updated_at → last_match_run_at` was 166s for a real
signup and 190-220s for most recent ones. All of it is `compute_job_matches`, which
persisted ONCE, at the end — so the onboarding shortlist screen showed a spinner
for three minutes.

`JobMatch` was already built for the other shape: `match_score` falls back to
`overlap_score` and reads as `verdict == "checking"`, "and upgrades in place when
the brain lands". The interface anticipated progressive disclosure; there was no
seam to emit it. `ranking.rank` now calls back with the triaged shortlist before
the expensive per-job reasoning, and the caller — which owns writes, so `rank`
stays "pure compute, no DB writes" — persists it.

Two rules the write has to keep:
  1. The shortlist appears BEFORE the deep eval, not after.
  2. The order the user first sees is PINNED. The brain's ranking is better, but a
     list that reorders under someone mid-read is worse than one that sharpens in
     place (Shivam, 2026-08-04). Accepted cost: a triage-approved job the deep eval
     later rates poorly keeps its slot and shows a weak verdict honestly.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.services import llm_ranker
from app.services.matching import ranking


class _Provider:
    pass


def _job(job_id: str, overlap: float) -> dict[str, Any]:
    return {"job_id": job_id, "overlap_score": overlap, "matched_skills": []}


def test_the_shortlist_is_handed_over_before_the_deep_eval(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Falsify by moving the callback below `evaluate_all` — order flips."""
    order: list[str] = []
    pool = [_job("a", 9), _job("b", 8), _job("c", 7)]

    monkeypatch.setattr(
        ranking.job_matcher, "get_top_matches", lambda *_a, **_k: list(pool)
    )

    async def _triage(_profile, jobs, _provider, keep):
        order.append("triage")
        return jobs[:keep]

    async def _evaluate_all(_profile, jobs, _provider, _on_progress):
        order.append("deep_eval")
        return {str(j["job_id"]): {"overall_score": 4.0} for j in jobs}

    monkeypatch.setattr(ranking.llm_ranker, "triage_shortlist", _triage)
    monkeypatch.setattr(ranking.llm_ranker, "evaluate_all", _evaluate_all)

    def _on_shortlist(jobs: list[dict[str, Any]]) -> None:
        order.append(f"persist:{len(jobs)}")

    result = asyncio.run(ranking.rank(
        {}, "",
        ranking.RankCandidates(
            job_skill_rows=[], user_skill_map={}, job_meta_fetcher=lambda _ids: {},
            top_n=3, triage_keep=2,
        ),
        provider=_Provider(),
        on_shortlist=_on_shortlist,
    ))

    assert order == ["triage", "persist:2", "deep_eval"], (
        "the shortlist must be handed over after the cheap triage gate and before "
        "the expensive per-job reasoning"
    )
    assert len(result.top_jobs) == 2


def test_the_pool_is_not_handed_over_untriaged(monkeypatch: pytest.MonkeyPatch) -> None:
    """The raw overlap head contains jobs the brain rejects outright — a banker
    role scoring overlap on 'Communication' for a backend engineer. Showing those
    as a first shortlist spends the top slot on something already known to be
    wrong, and the pin would then hold it there."""
    handed: list[list[dict[str, Any]]] = []
    pool = [_job("junk", 9), _job("good", 8)]

    monkeypatch.setattr(
        ranking.job_matcher, "get_top_matches", lambda *_a, **_k: list(pool)
    )

    async def _triage(_profile, _jobs, _provider, keep):
        return [_job("good", 8)][:keep]

    async def _evaluate_all(_p, jobs, _pr, _cb):
        return {str(j["job_id"]): {"overall_score": 4.0} for j in jobs}

    monkeypatch.setattr(ranking.llm_ranker, "triage_shortlist", _triage)
    monkeypatch.setattr(ranking.llm_ranker, "evaluate_all", _evaluate_all)

    asyncio.run(ranking.rank(
        {}, "",
        ranking.RankCandidates(
            job_skill_rows=[], user_skill_map={}, job_meta_fetcher=lambda _ids: {},
            top_n=2, triage_keep=1,
        ),
        provider=_Provider(),
        on_shortlist=handed.append,
    ))

    assert [j["job_id"] for j in handed[0]] == ["good"]


class _CapturingDB:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self._pending: list[dict[str, Any]] = []

    def table(self, _name: str) -> "_CapturingDB":
        return self

    def upsert(self, rows: list[dict[str, Any]], **_kw: Any) -> "_CapturingDB":
        self._pending = rows
        return self

    def execute(self) -> None:
        self.rows = self._pending


def _ranks(db: _CapturingDB) -> dict[str, int]:
    return {row["job_id"]: row["llm_rank"] for row in db.rows}


def _stub_credibility(monkeypatch: pytest.MonkeyPatch) -> None:
    """`persist_matches` imports this inside the function, so patch it at source."""
    from app.services import match_credibility

    monkeypatch.setattr(
        match_credibility, "evaluate_credibility",
        lambda *_a, **_k: type("C", (), {
            "credible": False, "recommendation": None, "context_hash": "ctx",
            "seniority_compatibility": "compatible",
        })(),
    )


def test_the_order_the_user_was_shown_survives_the_brain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The brain would put `c` first. The user is already reading a list led by
    `a`, so `a` keeps the slot and only its numbers change."""
    _stub_credibility(monkeypatch)
    db = _CapturingDB()
    jobs = [_job("a", 9), _job("b", 8), _job("c", 7)]

    llm_ranker.persist_matches(
        db, "u1", "2026-08-03", jobs,
        {"c": {"overall_score": 4.9}, "a": {"overall_score": 2.0}, "b": {"overall_score": 1.0}},
        {},
        pinned_ranks={"a": 1, "b": 2, "c": 3},
    )

    assert _ranks(db) == {"a": 1, "b": 2, "c": 3}


def test_without_a_pin_the_brain_ranks_freely(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every other caller — the sweep, a paid Refresh — has no shown order to
    protect, so the pin must not change what they get."""
    _stub_credibility(monkeypatch)
    db = _CapturingDB()
    jobs = [_job("a", 9), _job("b", 8), _job("c", 7)]

    llm_ranker.persist_matches(
        db, "u1", "2026-08-03", jobs,
        {"c": {"overall_score": 4.9}, "a": {"overall_score": 2.0}, "b": {"overall_score": 1.0}},
        {},
    )

    assert _ranks(db)["c"] == 1


def test_a_provisional_row_can_never_become_an_agent_pick() -> None:
    """Provisional rows land in `user_job_matches`, which Agent Picks also reads.
    A row with no verdict must not be editorially recommended — asserted here
    rather than assumed, because the picks band is the surface that would present
    an unscored job as 'apply to this'."""
    from app.services.matching import agent_picks

    provisional = {
        "job_id": "a", "overall_score": None, "summary": None,
        "jobs": {"job_title": "Staff Engineer", "company_name": "Acme"},
    }
    assert agent_picks.select_agent_picks([provisional]) == []
