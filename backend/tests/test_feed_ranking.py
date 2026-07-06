"""The feed's verdict ordering — routers/jobs/list.py:_rank_feed_rows.

The "best jobs" rule at read time: brain-warmed cards float to the front ordered
by verdict (best first), carry the Match Verdict (score + word + is_strong), and
the un-warmed tail keeps its deterministic fit order below them. Rank down, never
hide. ranked_count tells the feed where to draw its "more roles" divider.
"""
from __future__ import annotations

from app.routers.jobs.list import _rank_feed_rows


def _row(job_id: str) -> dict:
    return {"job_id": job_id, "job_title": f"Role {job_id}", "matched_skill_count": 1}


def _ev(overall: float, *, overlap: float = 70.0, rec: str = "Apply", sen: str = "compatible") -> dict:
    return {"overall_score": overall, "overlap_score": overlap, "recommendation": rec,
            "grade": "A", "seniority_compatibility": sen, "legitimacy_tier": "high_confidence",
            "archetype": "builder"}


def test_ranked_cards_float_to_front_best_first() -> None:
    # Feed arrives fit-sorted: b, a, c. Brain says a > c > b.
    rows = [_row("b"), _row("a"), _row("c")]
    evals = {"a": _ev(4.5), "c": _ev(3.6), "b": _ev(3.1)}
    ranked = _rank_feed_rows(rows, evals)
    assert ranked == 3
    assert [r["job_id"] for r in rows] == ["a", "c", "b"]  # by match_score desc
    assert rows[0]["verdict"] == "strong"
    assert rows[0]["match_score"] == 90
    assert rows[0]["is_strong"] is True


def test_unwarmed_tail_keeps_fit_order_below_ranked() -> None:
    # Only 'a' and 'c' are warmed; 'b' and 'd' stay deterministic browse rows.
    rows = [_row("a"), _row("b"), _row("c"), _row("d")]
    evals = {"a": _ev(3.2), "c": _ev(4.0)}
    ranked = _rank_feed_rows(rows, evals)
    assert ranked == 2
    assert [r["job_id"] for r in rows] == ["c", "a", "b", "d"]  # ranked (best first), then fit tail
    # Un-warmed rows carry no verdict key — JobFeedItem fills it None on serialize.
    assert rows[2].get("verdict") is None
    assert rows[3].get("verdict") is None
    assert rows[2].get("match_score") is None


def test_weak_shortlist_still_shows_never_hidden() -> None:
    # Rank down, never hide: a "stretch" card ranks below stronger ones but stays.
    rows = [_row("a"), _row("b")]
    evals = {"a": _ev(2.4), "b": _ev(3.9)}  # a is weak, b is decent
    ranked = _rank_feed_rows(rows, evals)
    assert ranked == 2
    assert [r["job_id"] for r in rows] == ["b", "a"]
    assert rows[1]["verdict"] == "stretch"  # weak, but present


def test_no_evals_leaves_feed_untouched() -> None:
    rows = [_row("a"), _row("b")]
    ranked = _rank_feed_rows(rows, {})
    assert ranked == 0
    assert [r["job_id"] for r in rows] == ["a", "b"]
    assert rows[0].get("verdict") is None
