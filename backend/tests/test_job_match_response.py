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
