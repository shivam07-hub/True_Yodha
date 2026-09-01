"""CI guard: one ordering answers "how good is this job for me".

Same shape as `test_read_contract.py` — the thing that actually regresses here is
STRUCTURAL, and every instance of it was found by hand, months later.

The history this guards against is specific. "Best fit" once named FOUR different
orderings at once (CONTEXT.md "Match Verdict"):

  * `/market` feed        — a page-relative skill·role·fresh composite
  * ...then overwritten by  `match_score`, for whatever rows happened to be warmed
  * dashboard             — `match_score`
  * Collections (DEFAULT) — `prize × winnability`, a client-side fit score that
                            could disagree with the number printed on the card it
                            was ordering

And `classifyMatch` bucketed by GRADE, only consulting `verdict` when a row had
no grade — so a row could arrive `verdict: "strong", is_strong: true` and still be
filed below the bar. That was `credible-recommendation.ts`, deleted from the
frontend when Match Verdict shipped, grown back one file over. It regrew because
nothing failed when it did.

`tests/dashboard-feed-model.test.ts` holds the frontend half. This is the backend
half.

When one of these fails: do not relax the assertion. A second fit ordering is a
design decision — it needs a name, a label the user can see, and an entry in the
register below with a reason.
"""

from __future__ import annotations

from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]


def _src(rel: str) -> str:
    return (_BACKEND / rel).read_text()


# ── The register ─────────────────────────────────────────────────────────────
#
# Every ordering the job read path is allowed to apply, and what question it
# answers. A debt register, not a permission slip: `browse_composite` exists
# because un-rated inventory has no verdict yet, and it shrinks to nothing when
# the ranked head is precomputed (ARCHITECTURE_READ_PATH §12, R2).
DECLARED_ORDERINGS = {
    "match_verdict": (
        "MatchEval.match_score — THE fit answer. Brain-spined, overlap-gated, "
        "derived server-side in to_job_match and applied by _rank_feed_rows."
    ),
    "browse_composite": (
        "_fit_scores — the order un-RATED inventory is browsed in (skill·role·fresh, "
        "page-relative). NOT a fit claim: it governs only the tail below the warmed "
        "head, and it is page-relative so it is not cacheable and cannot be a "
        "per-(user,job) property. Retires with R2."
    ),
    "recency": "first_seen desc — the honest 'Newest' alternative. A different question.",
}


def test_the_feed_ranks_on_the_match_verdict_and_nothing_else() -> None:
    """`_rank_feed_rows` orders READ rows before unread, and within each half by
    `match_score` — never by grade and never by the raw 0-5 `overall_score`.
    Mixing `overall_score` into a percent is the exact bug the mobile row adapter
    shipped before Backlog #36.

    Two terms were added for Job Tracks and neither is a second ordering.

    WHICH SEARCH comes first, because cross-search ranking answers a question
    nobody asked — a consulting job and a marketing job were never competing for
    one slot. For the 83% with one search that term is constant and this sort is
    what it was.

    READ-BEFORE-UNREAD comes next, because `match_score` is the brain's score
    once the brain has run and RAW `overlap_score` before it: one field, two
    scales. A run keeps 20 rows per search and deep-evals 8, so twelve rows in
    twenty are permanently unevaluated, and a generous overlap floated them over
    rows the brain had read. The term tests PRESENCE of an eval, never its value.
    """
    src = _src("app/routers/jobs/list.py")
    start = src.index("def _rank_feed_rows")
    body = src[start : src.index("\n@router", start)]

    assert "me.match_score," in body, "the fit term is match_score and nothing else"
    assert "ranked.sort(key=lambda row: (row[0], -row[1], -row[2]))" in body
    # Neither new term may read how WELL the brain scored a row — only whether
    # it ran, and which search the row belongs to.
    # From the append to its closing paren — `me.match_score` also appears above
    # it, where the verdict is attached to the row.
    at = body.index("ranked.append((")
    key = body[at : body.index("))", at)]
    for forbidden in ("grade", "recommendation", "overall_score / 5", "risk_score", "is_strong"):
        assert forbidden not in key, f"{forbidden} may not enter the sort key"
    assert 'ev.get("overall_score") is not None' in key, "presence, not value"
    # Nothing else may become the sort key.
    assert "sort(key=lambda" not in body.replace(
        "ranked.sort(key=lambda row: (row[0], -row[1], -row[2]))", ""
    ), "a second sort in the ranker is a second ordering"


def test_agent_picks_attach_the_same_verdict_the_feed_does() -> None:
    """A pick is a note on a feed card, not a second body. Attaching MatchEval
    here by hand (or skipping the attach) is how the band hid the judge while
    the algorithm tail showed Stretch 56."""
    src = _src("app/routers/jobs/match.py")
    assert "get_cached_match_evals" in src
    assert "_rank_feed_rows" in src
    assert "reorder=False" in src


def test_reordering_follows_the_user_s_chosen_sort() -> None:
    """It reordered on EVERY sort, so "Newest" returned warmed-cards-first and the
    two-way toggle was wrong on both settings."""
    src = _src("app/routers/jobs/list.py")
    assert "def _rank_feed_rows(rows: list[dict], brain_evals: dict[str, dict], *, reorder: bool)" in src
    assert 'reorder=page_result["sort"] == "fit"' in src


def test_the_browse_composite_is_declared_as_not_a_fit_claim() -> None:
    """It is allowed to exist — un-rated inventory has no verdict — but it must be
    documented as the browse order, not a second answer to "how good is this"."""
    src = _src("app/repositories/jobs.py")
    start = src.index("def _fit_scores")
    body = src[start : start + 2000]
    assert "normalized over the candidate set" in body or "normalized within" in body, (
        "the composite must state that it is page-relative — that is what makes it "
        "uncacheable and disqualifies it as a per-(user,job) fit score"
    )
    assert "browse_composite" in DECLARED_ORDERINGS


def test_no_undeclared_fit_scorer_has_grown_back() -> None:
    """The frontend twins are deleted (`tests/dashboard-feed-model.test.ts` holds
    that line). Nothing equivalent may appear on the backend."""
    for rel in (
        "app/routers/jobs/list.py",
        "app/repositories/jobs.py",
        "app/services/llm_ranker.py",
        "app/services/matching/ranking.py",
    ):
        src = _src(rel)
        assert "winnability" not in src.lower(), f"{rel}: prize × winnability is deleted"
        assert "def _prize" not in src, f"{rel}: undeclared scorer"


def test_the_two_feed_sort_modes_are_the_two_the_client_offers() -> None:
    """`JobFeedSort = "fit" | "fresh"` in lib/api.ts. A third mode added on one
    side only is how a toggle starts lying about what it does."""
    src = _src("app/repositories/jobs.py")
    assert 'sort if sort in {"fresh", "fit"} else "fresh"' in src

    client = (_BACKEND.parent / "frontend" / "lib" / "api.ts").read_text()
    assert 'export type JobFeedSort = "fit" | "fresh"' in client


def test_every_declared_ordering_says_what_question_it_answers() -> None:
    """A register entry without a reason is a permission slip."""
    for name, reason in DECLARED_ORDERINGS.items():
        assert len(reason) > 40, f"{name}: needs a real reason, not a label"
