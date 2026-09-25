"""The match-run level gate and `candidates_for_user` are one predicate.

A seniority tag used to decide the pool while /market decided by the
employer's stated years. A "Senior Associate" asking for 2-6 years was on
the list and could not be ranked. The SQL is the authority; this module
pins the Python constants to the latest function body that defines it.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories.jobs import JobsRepository
from app.services.job_eligibility import (
    PERSON_YEAR_SPAN_BY_BAND,
    SENIOR_LEVEL_TAGS,
    stated_range_admits,
)

MIGRATIONS = Path(__file__).resolve().parents[2] / "database" / "migrations"


def _latest_candidates_for_user() -> str:
    """The migration that last replaced the function, comments stripped.

    A later file wins. Pinning an older body would stay green after a
    replacement dropped the predicate.
    """
    bodies = [
        path
        for path in sorted(MIGRATIONS.glob("*.sql"))
        if "create or replace function public.candidates_for_user("
        in path.read_text(encoding="utf-8").lower()
    ]
    assert bodies, "no migration defines candidates_for_user"
    sql = bodies[-1].read_text(encoding="utf-8")
    return "\n".join(
        line for line in sql.splitlines() if not line.strip().startswith("--")
    )


def test_python_spans_and_tags_are_the_sql_ones() -> None:
    code = _latest_candidates_for_user().lower()
    for band, lo, hi in PERSON_YEAR_SPAN_BY_BAND:
        assert f"('{band}', {lo}, {hi})" in code
    tags = ",".join(f"'{tag}'" for tag in SENIOR_LEVEL_TAGS)
    assert f"array[{tags}]" in code.replace(" ", "")
    assert "v_lo := v_years - 1" in code
    assert "v_hi := v_years + 1" in code
    assert "(p.years_experience is null)" in code
    assert "coalesce(p.lo, 0)::numeric <= v_hi" in code
    assert "coalesce(p.hi, 40)::numeric >= v_lo" in code
    assert "p.lo is null and p.hi is null" in code
    assert "v_centre < 5" in code


# (profile, job, admit). Years of 3.2 → span [2.2, 4.2], centre 3.2.
_CASES = [
    (
        "stated senior range that overlaps is admitted",
        {"years_experience": 3.2},
        {"min_years_experience": 2, "max_years_experience": 6, "seniority_level": "senior"},
        True,
    ),
    (
        "stated range above the person is rejected",
        {"years_experience": 3.2},
        {"min_years_experience": 8, "max_years_experience": 14, "seniority_level": "mid"},
        False,
    ),
    (
        "a one-sided minimum still overlaps",
        {"years_experience": 3.2},
        {"min_years_experience": 2, "seniority_level": "senior"},
        True,
    ),
    (
        "a one-sided minimum above the span does not",
        {"years_experience": 3.2},
        {"min_years_experience": 6, "seniority_level": "mid"},
        False,
    ),
    (
        "no range and a senior tag rejects under centre 5",
        {"years_experience": 3.2},
        {"seniority_level": "senior"},
        False,
    ),
    (
        "no range and no tag is admitted",
        {"years_experience": 3.2},
        {},
        True,
    ),
    (
        "no range and a mid tag is admitted",
        {"years_experience": 3.2},
        {"seniority_level": "mid"},
        True,
    ),
    (
        "unknown years use the mid band, and a fitting range beats the tag",
        {"target_seniority": "mid"},
        {"min_years_experience": 2, "max_years_experience": 6, "seniority_level": "senior"},
        True,
    ),
    (
        "unknown years, mid band, no range, lead tag rejects",
        {"target_seniority": "mid"},
        {"seniority_level": "Lead"},
        False,
    ),
    (
        "unknown years, senior band, no range, senior tag is admitted",
        {"target_seniority": "senior"},
        {"seniority_level": "senior"},
        True,
    ),
    (
        "no band is the open span, so an unstated executive tag is admitted",
        {},
        {"seniority_level": "executive"},
        True,
    ),
    (
        "legacy any is that same open span, not a closed door",
        {"target_seniority": "any"},
        {"min_years_experience": 10, "max_years_experience": 12, "seniority_level": "executive"},
        True,
    ),
    (
        "null years are not zero: a mid band still overlaps 2-4",
        {"years_experience": None, "target_seniority": "mid"},
        {"min_years_experience": 2, "max_years_experience": 4},
        True,
    ),
    (
        "zero years are real: 2-4 does not overlap [-1, 1]",
        {"years_experience": 0},
        {"min_years_experience": 2, "max_years_experience": 4},
        False,
    ),
    (
        "director and staff are senior-side tags",
        {"years_experience": 3.2},
        {"seniority_level": "Director"},
        False,
    ),
    (
        "staff with no range rejects a junior centre",
        {"years_experience": 1},
        {"seniority_level": "staff"},
        False,
    ),
]


@pytest.mark.parametrize(
    ("label", "profile", "job", "admit"),
    _CASES,
    ids=[case[0] for case in _CASES],
)
def test_stated_range_case(
    label: str, profile: dict, job: dict, admit: bool
) -> None:
    assert stated_range_admits(profile, job) is admit, label


def test_the_pool_keeps_a_senior_tag_whose_stated_range_fits() -> None:
    """The measured hole: on her list, rejected by the tag, admitted by the range."""
    repo = object.__new__(JobsRepository)
    profile = {
        "target_career_band": "engineering_data",
        "explored_career_bands": ["engineering_data"],
        "target_seniority": "mid",
        "years_experience": None,
    }
    fitting = {
        "job_id": "fit",
        "job_title": "Senior Associate, Payments",
        "career_band": "engineering_data",
        "seniority_level": "senior",
        "min_years_experience": 2,
        "max_years_experience": 6,
    }
    too_senior = {
        "job_id": "out",
        "job_title": "Staff Engineer",
        "career_band": "engineering_data",
        "seniority_level": "staff",
        "min_years_experience": None,
        "max_years_experience": None,
    }
    kept = repo.filter_job_ids_for_eligibility(
        ["fit", "out"],
        profile=profile,
        jobs=[fitting, too_senior],
    )
    assert kept == ["fit"]
