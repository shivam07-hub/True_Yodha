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
# answers. A debt register, not a permission slip.
#
# Two of the three entries here are GONE, and the register is shorter rather than
# annotated, because a retired ordering that stays listed reads as one that is
# still allowed:
#   * `browse_composite` (`_fit_scores`) was a page-relative skill·role·fresh
#     blend over whatever 500 rows the sample returned. It was declared to
#     "retire with R2"; it retired on 2026-09-24 with the sample itself.
#   * `recency` was the "Newest" half of the sort toggle. A finite list of forty
#     chosen jobs has one order, so there is no toggle to be the other half of.
DECLARED_ORDERINGS = {
    "match_verdict": (
        "MatchEval.match_score — THE fit answer. Brain-spined, overlap-gated, "
        "derived server-side in to_job_match and applied by _rank_feed_rows."
    ),
    "retrieval_score": (
        "candidates_for_user's `score` — direction match + must-have-weighted skill "
        "overlap + freshness, computed in SQL over the WHOLE corpus and returned "
        "already ordered. NOT a fit claim and never shown as a number: it decides "
        "which forty jobs exist for this person, and the verdict orders what the "
        "brain has warmed above them."
    ),
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


def test_the_ranker_still_takes_reorder_as_a_decision() -> None:
    """The list has one order now, so /market passes `reorder=True` — but the flag
    stays a parameter because Agent Picks passes False. It reordered on EVERY sort
    once, which returned warmed-cards-first to a user who asked for "Newest"; the
    flag is what made that visible, and a hardcoded reorder would hide the next one."""
    src = _src("app/routers/jobs/list.py")
    assert "def _rank_feed_rows(rows: list[dict], brain_evals: dict[str, dict], *, reorder: bool)" in src
    assert "reorder=True" in src


def test_the_retired_browse_composite_has_not_grown_back() -> None:
    """`_fit_scores` ranked whatever the 500-row sample happened to return, and its
    own register entry said it would retire. Retrieval ranks the whole corpus in
    SQL now, so a second Python scorer over the rows it returns would be ordering
    an answer that is already ordered."""
    src = _src("app/repositories/jobs.py")
    assert "_fit_scores" not in src
    assert "_FIT_WEIGHTS" not in src
    assert "browse_composite" not in DECLARED_ORDERINGS
    assert "retrieval_score" in DECLARED_ORDERINGS


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


def test_neither_side_still_offers_a_sort_the_other_does_not() -> None:
    """There is no sort lens. A finite list of forty chosen jobs has one order, and
    the "Best fit ⇄ Newest" toggle went with the sample it was reordering.

    This test used to assert the two modes matched on both sides, because a third
    mode added on one side only is how a toggle starts lying about what it does.
    The same failure is now a mode surviving on one side at all."""
    src = _src("app/repositories/jobs.py")
    assert 'sort in {"fresh", "fit"}' not in src

    client = (_BACKEND.parent / "frontend" / "lib" / "api.ts").read_text()
    assert "JobFeedSort" not in client, "the client still offers a sort the server dropped"


def test_every_declared_ordering_says_what_question_it_answers() -> None:
    """A register entry without a reason is a permission slip."""
    for name, reason in DECLARED_ORDERINGS.items():
        assert len(reason) > 40, f"{name}: needs a real reason, not a label"
