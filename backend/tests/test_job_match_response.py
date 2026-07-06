from datetime import date

import pytest
from pydantic import ValidationError

from app.routers.jobs._shared import to_job_match
from app.schemas import MatchEval


def test_to_job_match_preserves_row_batch_week_for_historical_cards() -> None:
    match = to_job_match(
        {
            "id": 1,
            "job_id": "job-old",
            "batch_week": "2026-05-25",
            "overlap_score": 81,
            "matched_skills": [],
            "is_recommended": True,
            "baseline_version_id": 17,
            "target_context_hash": "current-target",
            # The matcher (match_credibility) writes a string label here, not a
            # bool. Use the real persisted value so this test exercises the actual
            # write→read contract (a bool fixture hid the prod-500 type drift).
            "seniority_compatibility": "compatible",
            "jobs": {
                "job_title": "Analyst",
                "company_name": "Acme",
                "first_seen": 20260601,
                "last_seen": 20200101,
                "is_active": False,
            },
        },
        date(2026, 6, 1),
    )

    assert match.batch_week == date(2026, 5, 25)
    assert match.first_seen == "2026-06-01"
    assert match.last_seen_at == "2020-01-01"
    assert match.is_stale is True
    assert match.is_active is False
    assert match.is_recommended is True
    assert match.baseline_version_id == 17
    assert match.target_context_hash == "current-target"
    assert match.seniority_compatibility == "compatible"


@pytest.mark.parametrize("label", ["compatible", "incompatible", "unknown", None])
def test_to_job_match_round_trips_every_seniority_label(label) -> None:
    """The matcher emits a string label, never a bool. All three labels (and
    NULL) must round-trip through the read seam — the regression for the prod
    500 that fired only for users whose rows carried a non-bool value."""
    match = to_job_match(
        {"id": 1, "job_id": "j", "seniority_compatibility": label, "jobs": {}},
        date(2026, 6, 1),
    )
    assert match.seniority_compatibility == label


def test_match_eval_rejects_the_bool_drift() -> None:
    """A bool in seniority_compatibility is exactly the drift that 500'd prod.
    The typed seam must reject it here — at one clear, tested boundary — not at
    the per-user response gate."""
    with pytest.raises(ValidationError):
        MatchEval.model_validate({"seniority_compatibility": True})


def test_match_eval_ignores_unknown_columns() -> None:
    """Tolerant by design: a newly-added persisted column never narrows the read
    or 500s the dashboard."""
    ev = MatchEval.model_validate({"overlap_score": 80, "a_brand_new_column": "x"})
    assert ev.overlap_score == 80


# ── Match Verdict — the fusion seam is the test surface ───────────────────────

def _eval(**over) -> MatchEval:
    base = {
        "overlap_score": 70,
        "overall_score": 4.0,
        "is_recommended": True,
        "recommendation": "Apply",
        "seniority_compatibility": "compatible",
    }
    base.update(over)
    return MatchEval.model_validate(base)


def test_match_score_is_brain_spined_not_raw_overlap() -> None:
    """THE fix: the number reflects the brain's holistic eval, not raw overlap.
    A job with high skill overlap but a weak brain score reads LOW."""
    ev = _eval(overlap_score=90, overall_score=2.0)  # lots of skills, weak match
    assert ev.match_score == 40   # 2.0/5*100 — not 90
    assert ev.verdict == "stretch"


def test_checking_is_provisional_overlap_only_before_brain() -> None:
    """Before the async brain runs (overall_score None) the number is overlap-only
    and the verdict is the honest provisional 'checking' — never a fake-final."""
    ev = _eval(overall_score=None, overlap_score=63)
    assert ev.match_score == 63
    assert ev.verdict == "checking"
    assert ev.is_strong is False


def test_strong_requires_credibility_and_a_real_overlap_floor() -> None:
    ev = _eval(overall_score=4.2, overlap_score=75)
    assert ev.verdict == "strong"
    assert ev.is_strong is True
    assert ev.match_score == 84


def test_strong_is_denied_without_skill_coverage_even_if_brain_is_generous() -> None:
    """The invariant: cannot read 'strong' with too few of the required skills,
    however high the brain scores it. The number can be generous; the word cannot."""
    ev = _eval(overall_score=4.8, overlap_score=25)  # below the overlap floor
    assert ev.match_score == 96
    assert ev.verdict != "strong"
    assert ev.is_strong is False


def test_incompatible_seniority_never_beats_stretch() -> None:
    ev = _eval(overall_score=4.5, seniority_compatibility="incompatible")
    assert ev.verdict == "stretch"


def test_worth_it_is_the_decent_middle() -> None:
    ev = _eval(overall_score=3.2, recommendation="Skip", is_recommended=False)
    assert ev.verdict == "worth_it"


def test_verdict_reaches_the_response_through_the_single_reader() -> None:
    """to_job_match is the one place the verdict is set — no surface re-derives it."""
    match = to_job_match(
        {
            "id": 1,
            "job_id": "j",
            "overlap_score": 75,
            "overall_score": 4.2,
            "is_recommended": True,
            "recommendation": "Apply",
            "seniority_compatibility": "compatible",
            "jobs": {},
        },
        date(2026, 6, 1),
    )
    assert match.match_score == 84
    assert match.verdict == "strong"
    assert match.is_strong is True
