"""The feed's verdict ordering — routers/jobs/list.py:_rank_feed_rows.

The "best jobs" rule at read time: brain-warmed cards float to the front ordered
by verdict (best first), carry the Match Verdict (score + word + is_strong), and
the un-warmed tail keeps its deterministic fit order below them. Rank down, never
hide. ranked_count tells the feed where to draw its "more roles" divider.

Reordering is the user's instruction, not ours: it happens only under the "Best
fit" rank. Under "Newest" the badges still attach — a verdict is information — but
the order stays newest-first.
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
    ranked = _rank_feed_rows(rows, evals, reorder=True)
    assert ranked == 3
    assert [r["job_id"] for r in rows] == ["a", "c", "b"]  # by match_score desc
    assert rows[0]["verdict"] == "strong"
    assert rows[0]["match_score"] == 90
    assert rows[0]["is_strong"] is True


def test_unwarmed_tail_keeps_fit_order_below_ranked() -> None:
    # Only 'a' and 'c' are warmed; 'b' and 'd' stay deterministic browse rows.
    rows = [_row("a"), _row("b"), _row("c"), _row("d")]
    evals = {"a": _ev(3.2), "c": _ev(4.0)}
    ranked = _rank_feed_rows(rows, evals, reorder=True)
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
    ranked = _rank_feed_rows(rows, evals, reorder=True)
    assert ranked == 2
    assert [r["job_id"] for r in rows] == ["b", "a"]
    assert rows[1]["verdict"] == "stretch"  # weak, but present


def test_no_evals_leaves_feed_untouched() -> None:
    rows = [_row("a"), _row("b")]
    ranked = _rank_feed_rows(rows, {}, reorder=True)
    assert ranked == 0
    assert [r["job_id"] for r in rows] == ["a", "b"]
    assert rows[0].get("verdict") is None


# ── "Newest" means newest ─────────────────────────────────────────────────────
#
# This reordered on EVERY sort. A user who picked "Newest" got warmed-cards-first,
# so the two-way toggle was wrong on both of its settings.

def test_newest_keeps_its_order_and_still_shows_verdicts() -> None:
    rows = [_row("b"), _row("a"), _row("c")]
    evals = {"a": _ev(4.5), "c": _ev(3.6), "b": _ev(3.1)}
    ranked = _rank_feed_rows(rows, evals, reorder=False)
    assert [r["job_id"] for r in rows] == ["b", "a", "c"], "the user asked for newest"
    # The badge is information; withholding it would be a second wrong answer.
    assert rows[1]["verdict"] == "strong"
    assert rows[1]["match_score"] == 90
    # No leading ranked block → no divider to draw.
    assert ranked == 0


def test_newest_with_no_evals_is_untouched() -> None:
    rows = [_row("a"), _row("b")]
    assert _rank_feed_rows(rows, {}, reorder=False) == 0
    assert [r["job_id"] for r in rows] == ["a", "b"]


# ── Job Tracks: a search keeps 20 rows and the brain reads 8 of them ──────────


def _provisional(overlap: float, *, track: int | None = None) -> dict:
    """A row the run kept but never deep-evaluated — real job, overlap score,
    no verdict. `MatchEval` renders it `checking` and its `match_score` is the
    RAW overlap, which is a different scale from an evaluated row's
    `overall_score / 5 * 100`."""
    return {"overall_score": None, "overlap_score": overlap, "track_id": track}


def test_a_read_row_outranks_an_unread_one_that_merely_has_more_overlap() -> None:
    """The bug this ordering exists to stop.

    `match_score` is the brain's score after the brain runs and RAW overlap
    before it — one field, two scales. An unread row with 82% overlap therefore
    outranked a row the brain read and scored 3.5/5 (70), which is exactly the
    "82% shouts but it's a bad match" defect the brain spine was introduced to
    fix, reappearing in the sort.
    """
    rows = [_row("unread"), _row("read")]
    evals = {"unread": _provisional(82.0), "read": _ev(3.5, overlap=55.0)}
    ranked = _rank_feed_rows(rows, evals, reorder=True)

    assert ranked == 2, "both are real matches; neither is hidden"
    assert [r["job_id"] for r in rows] == ["read", "unread"]
    assert rows[0]["match_score"] == 70 and rows[0]["verdict"] != "checking"
    assert rows[1]["match_score"] == 82 and rows[1]["verdict"] == "checking"


def test_read_rows_sort_among_themselves_and_so_do_unread_ones() -> None:
    rows = [_row("u1"), _row("r1"), _row("u2"), _row("r2")]
    evals = {
        "r1": _ev(3.4), "r2": _ev(4.6),
        "u1": _provisional(60.0), "u2": _provisional(90.0),
    }
    _rank_feed_rows(rows, evals, reorder=True)
    assert [r["job_id"] for r in rows] == ["r2", "r1", "u2", "u1"]


def test_the_feed_carries_which_search_found_each_card() -> None:
    """NULL is track 1 — the profile — which is every card for the 83% of users
    with one search, and every card in the browse tail, which no search found."""
    rows = [_row("a"), _row("b"), _row("browse")]
    evals = {"a": _ev(4.2) | {"track_id": 7}, "b": _ev(4.0) | {"track_id": None}}
    _rank_feed_rows(rows, evals, reorder=True)
    by_id = {r["job_id"]: r for r in rows}
    assert by_id["a"]["track_id"] == 7
    assert by_id["b"]["track_id"] is None
    assert "track_id" not in by_id["browse"], "a browse row was found by no search"


def test_two_searches_are_grouped_before_they_are_ranked() -> None:
    """Cross-search ranking answers a question nobody asked: a consulting job and
    a marketing job were never competing for one slot. Interleaving them by score
    is what would make "Best fit" a lie for someone running two searches."""
    rows = [_row("m_read"), _row("p_unread"), _row("m_unread"), _row("p_read")]
    evals = {
        # The profile track (NULL) is track 1 and comes first, even though the
        # marketing row scores higher than everything it has.
        "p_read": _ev(3.2) | {"track_id": None},
        "p_unread": _provisional(51.0, track=None),
        "m_read": _ev(4.8) | {"track_id": 9},
        "m_unread": _provisional(95.0, track=9),
    }
    _rank_feed_rows(rows, evals, reorder=True)
    assert [r["job_id"] for r in rows] == ["p_read", "p_unread", "m_read", "m_unread"]


def test_the_second_search_never_jumps_ahead_of_the_first() -> None:
    """The sort negates the two 'best first' terms rather than reversing the
    whole key — one `reverse=True` would also flip the track order and open the
    feed on the search the user added last."""
    rows = [_row("t2"), _row("t1")]
    evals = {"t1": _ev(3.0) | {"track_id": None}, "t2": _ev(4.9) | {"track_id": 2}}
    _rank_feed_rows(rows, evals, reorder=True)
    assert [r["job_id"] for r in rows] == ["t1", "t2"]


def test_a_single_track_user_is_unaffected_by_any_of_this() -> None:
    """`_track_specs` returns () for them, so every row is evaluated exactly as
    before and every `track_id` is NULL. The ordering must be what it was."""
    rows = [_row("b"), _row("a"), _row("c")]
    evals = {"a": _ev(4.5), "c": _ev(3.6), "b": _ev(3.1)}
    assert _rank_feed_rows(rows, evals, reorder=True) == 3
    assert [r["job_id"] for r in rows] == ["a", "c", "b"]
    assert all(r["track_id"] is None for r in rows)
