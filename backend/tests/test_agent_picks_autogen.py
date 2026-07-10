"""Backlog #36 N5 — Agent Picks auto-generation from the fresh match stack."""

from __future__ import annotations

from typing import Any

from app.services.matching import agent_picks


def _row(
    job_id: str,
    *,
    score: float | None,
    rec: str = "Apply",
    summary: str = "Strong overlap on growth + lifecycle; you'd hit the ground running.",
    overlap: float = 50.0,
    tier: str | None = None,
    active: bool = True,
) -> dict[str, Any]:
    return {
        "job_id": job_id,
        "overall_score": score,
        "recommendation": rec,
        "summary": summary,
        "overlap_score": overlap,
        "legitimacy_tier": tier,
        "jobs": {"is_active": active, "job_title": f"Role {job_id}", "company_name": "Acme"},
    }


def test_selects_only_strong_apply_verdicts() -> None:
    stack = [
        _row("j1", score=4.6),                  # strong + Apply → in
        _row("j2", score=3.2),                  # below floor → out
        _row("j3", score=4.0, rec="Skip"),      # strong but Skip → out
        _row("j4", score=None),                 # never rated → out
    ]
    picks = agent_picks.select_agent_picks(stack)
    assert [p["job_id"] for p in picks] == ["j1"]


def test_ranks_by_score_and_assigns_tiers() -> None:
    stack = [
        _row("mid", score=3.7),
        _row("top", score=4.8),
        _row("bull", score=4.3),
    ]
    picks = agent_picks.select_agent_picks(stack)
    assert [p["job_id"] for p in picks] == ["top", "bull", "mid"]
    assert [p["agent_rank"] for p in picks] == [1, 2, 3]
    assert [p["tier"] for p in picks] == ["bullseye", "bullseye", "strong"]


def test_drops_junk_legitimacy_and_inactive_jobs() -> None:
    stack = [
        _row("good", score=4.5),
        _row("scam", score=4.9, tier="scam"),       # flagged junk → out even if high
        _row("delisted", score=4.4, active=False),   # job gone → out
    ]
    picks = agent_picks.select_agent_picks(stack)
    assert [p["job_id"] for p in picks] == ["good"]


def test_no_fabrication_drops_pick_without_summary() -> None:
    stack = [
        _row("has_why", score=4.2),
        _row("no_why", score=4.7, summary="   "),   # no grounded reason → never invent one
    ]
    picks = agent_picks.select_agent_picks(stack)
    assert [p["job_id"] for p in picks] == ["has_why"]
    assert picks[0]["comment"].strip()  # the quoted "why" is the brain's real summary


def test_caps_at_max_picks() -> None:
    stack = [_row(f"j{i}", score=4.0 + i * 0.01) for i in range(20)]
    picks = agent_picks.select_agent_picks(stack)
    assert len(picks) == agent_picks.MAX_PICKS


class _FakeRepo:
    def __init__(self, stack: list[dict[str, Any]]) -> None:
        self._stack = stack
        self.replaced: dict[str, Any] = {}

    def get_user_match_stack(self, _user_id: str) -> list[dict[str, Any]]:
        return self._stack

    def replace_agent_picks(
        self, user_id: str, picks: list[dict[str, Any]], scrape_batch: int | None = None
    ) -> int:
        self.replaced = {"user_id": user_id, "picks": picks, "scrape_batch": scrape_batch}
        return len(picks)


def test_regenerate_reads_stack_and_replaces_set() -> None:
    repo = _FakeRepo([_row("j1", score=4.5), _row("j2", score=3.9)])
    written = agent_picks.regenerate_for_user(repo, "u1", scrape_batch=20260710)
    assert written == 2
    assert repo.replaced["user_id"] == "u1"
    assert repo.replaced["scrape_batch"] == 20260710
    assert [p["job_id"] for p in repo.replaced["picks"]] == ["j1", "j2"]


def test_regenerate_empty_stack_clears_band() -> None:
    repo = _FakeRepo([])
    assert agent_picks.regenerate_for_user(repo, "u1") == 0
    assert repo.replaced["picks"] == []
