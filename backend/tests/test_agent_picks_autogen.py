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
    listing_confidence: str = "active",
    main_skills: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "job_id": job_id,
        "overall_score": score,
        "recommendation": rec,
        "summary": summary,
        "overlap_score": overlap,
        "legitimacy_tier": tier,
        "jobs": {
            "is_active": active,
            "listing_confidence": listing_confidence,
            "job_title": f"Role {job_id}",
            "company_name": "Acme",
            "main_skills": main_skills,
        },
    }


def test_selects_only_strong_apply_verdicts() -> None:
    stack = [
        _row("j1", score=4.6),                  # strong + Apply → in
        _row("j2", score=3.9),                  # below the 4.0 apply bar → out
        _row("j3", score=4.0, rec="Skip"),      # strong but Skip → out
        _row("j4", score=None),                 # never rated → out
    ]
    picks = agent_picks.select_agent_picks(stack)
    assert [p["job_id"] for p in picks] == ["j1"]


def test_ranks_by_score_and_assigns_tiers() -> None:
    stack = [
        _row("mid", score=4.1),
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
        _row("uncertain", score=4.8, listing_confidence="uncertain"),
    ]
    picks = agent_picks.select_agent_picks(stack)
    assert [p["job_id"] for p in picks] == ["good"]


def test_drops_career_ops_suspicious_legitimacy_verdict() -> None:
    stack = [
        _row("good", score=4.5, tier="high_confidence"),
        _row("suspicious", score=4.9, tier="suspicious"),
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
    """A repo with no targeting: the direction vocabulary comes back empty, so
    every pick grades `unknown` and the band orders on the brain score alone."""

    _db = None

    def __init__(self, stack: list[dict[str, Any]]) -> None:
        self._stack = stack
        self.replaced: dict[str, Any] = {}

    def get_user_profile_targeting(self, _user_id: str) -> dict[str, Any]:
        return {}

    def get_user_match_stack(self, _user_id: str) -> list[dict[str, Any]]:
        return self._stack

    def replace_agent_picks(
        self, user_id: str, picks: list[dict[str, Any]], scrape_batch: int | None = None
    ) -> int:
        self.replaced = {"user_id": user_id, "picks": picks, "scrape_batch": scrape_batch}
        return len(picks)


def test_regenerate_reads_stack_and_replaces_set() -> None:
    repo = _FakeRepo([_row("j1", score=4.5), _row("j2", score=4.2)])
    written = agent_picks.regenerate_for_user(repo, "u1", scrape_batch=20260710)
    assert written == 2
    assert repo.replaced["user_id"] == "u1"
    assert repo.replaced["scrape_batch"] == 20260710
    assert [p["job_id"] for p in repo.replaced["picks"]] == ["j1", "j2"]


def test_regenerate_empty_stack_clears_band() -> None:
    repo = _FakeRepo([])
    assert agent_picks.regenerate_for_user(repo, "u1") == 0
    assert repo.replaced["picks"] == []


# ── the direction gate (ADR-0022 / direction_fit) ────────────────────────────

SALES = frozenset({"regional sales", "sales process", "market share"})


def test_aspiration_outranks_the_score() -> None:
    stack = [
        _row("off", score=4.9, main_skills=["Welding", "Forklift"]),
        _row("on", score=4.1, main_skills=["Regional Sales", "Sales Process"]),
    ]
    picks = agent_picks.select_agent_picks(stack, vocabulary=SALES)
    assert [p["job_id"] for p in picks] == ["on", "off"]
    assert [p["direction"] for p in picks] == ["on_direction", "off_direction"]


def test_an_ungradable_listing_sits_between_on_and_off_direction() -> None:
    stack = [
        _row("off", score=4.8, main_skills=["Welding"]),
        _row("unknown", score=4.2, main_skills=None),
        _row("on", score=4.0, main_skills=["Regional Sales", "Market Share"]),
    ]
    picks = agent_picks.select_agent_picks(stack, vocabulary=SALES)
    assert [p["job_id"] for p in picks] == ["on", "unknown", "off"]


def test_no_quota_off_direction_fills_the_band_when_nothing_on_direction_qualifies() -> None:
    stack = [_row(f"j{i}", score=4.5, main_skills=["Welding"]) for i in range(3)]
    picks = agent_picks.select_agent_picks(stack, vocabulary=SALES)
    assert len(picks) == 3
    assert {p["direction"] for p in picks} == {"off_direction"}


def test_without_a_direction_every_pick_is_unknown_and_the_score_orders() -> None:
    stack = [_row("low", score=4.1), _row("high", score=4.9)]
    picks = agent_picks.select_agent_picks(stack, vocabulary=frozenset())
    assert [p["job_id"] for p in picks] == ["high", "low"]
    assert {p["direction"] for p in picks} == {"unknown"}


def test_the_apply_bar_is_four() -> None:
    assert agent_picks.PICK_SCORE == 4.0
    stack = [_row("just_under", score=3.99), _row("at_bar", score=4.0)]
    assert [p["job_id"] for p in agent_picks.select_agent_picks(stack)] == ["at_bar"]
