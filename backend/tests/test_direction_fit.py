"""direction_fit — the one grade for "is this job the work you asked for".

The module is the test surface: the rule (>= 2 of the direction's twelve
most-demanded skills), the union across a person's directions, and the two ways
a grade can be unknown are tested here once, not through the pick gate, the
Career Ops evaluation and the card that each read it.
"""
from __future__ import annotations

from app.services.matching import direction_fit


CORE = {
    "Sales Management": [
        "New Business Development", "Market Share", "Communication", "Regional Sales",
        "Business Objectives", "Presentations", "Team Leadership", "Corporate Sourcing",
        "Customer Relationship Building", "Sales Territory Management", "Trust Accounts",
        "Sales Process",
    ],
    "Software Development": [
        "Software Development", "Continuous Integration", "Python (Programming Language)",
        "SQL (Programming Language)",
    ],
}


def _vocab(*families: str) -> frozenset[str]:
    return direction_fit.vocabulary(CORE, families)


# ── the rule ─────────────────────────────────────────────────────────────────

def test_two_characteristic_skills_is_on_direction():
    fit = direction_fit.grade(["Regional Sales", "Sales Process", "Forklift"], _vocab("Sales Management"))
    assert fit.verdict == "on_direction"
    assert fit.is_on_direction
    assert fit.matched == ("Regional Sales", "Sales Process")


def test_one_characteristic_skill_is_off_direction():
    fit = direction_fit.grade(["Communication", "Welding"], _vocab("Sales Management"))
    assert fit.verdict == "off_direction"
    assert fit.hits == 1


def test_the_bar_is_two():
    assert direction_fit.FIT_MIN_HITS == 2


def test_matched_keeps_the_job_spelling_for_the_surface_that_explains_it():
    fit = direction_fit.grade(["  regional   sales ", "SALES PROCESS"], _vocab("Sales Management"))
    assert fit.verdict == "on_direction"
    assert fit.matched == ("regional   sales", "SALES PROCESS")


def test_a_repeated_skill_counts_once():
    fit = direction_fit.grade(["Market Share", "market share", "Market  Share"], _vocab("Sales Management"))
    assert fit.verdict == "off_direction"
    assert fit.hits == 1


# ── unknown is not a verdict ─────────────────────────────────────────────────

def test_no_direction_vocabulary_reads_unknown():
    fit = direction_fit.grade(["Regional Sales", "Sales Process"], frozenset())
    assert fit.verdict == "unknown"
    assert not fit.is_on_direction


def test_a_listing_naming_no_skills_reads_unknown():
    assert direction_fit.grade([], _vocab("Sales Management")).verdict == "unknown"
    assert direction_fit.grade(None, _vocab("Sales Management")).verdict == "unknown"


def test_a_family_the_snapshot_never_heard_of_contributes_nothing():
    assert _vocab("Teacher or a tele caller") == frozenset()
    assert direction_fit.grade(["Regional Sales"], _vocab("Teacher or a tele caller")).verdict == "unknown"


# ── a person aims at more than one direction ─────────────────────────────────

def test_vocabulary_is_the_union_of_the_users_directions():
    fit = direction_fit.grade(
        ["Regional Sales", "Continuous Integration"],
        _vocab("Sales Management", "Software Development"),
    )
    assert fit.verdict == "on_direction"


def test_passing_on_one_direction_cannot_cost_a_skill_another_direction_asks_for():
    # The stakeholder question: a shared skill belongs to both profiles, so a
    # sales role still grades on it after the tech direction is dropped.
    both = _vocab("Sales Management", "Software Development")
    sales_only = _vocab("Sales Management")
    job = ["Communication", "Sales Process"]
    assert direction_fit.grade(job, both).verdict == "on_direction"
    assert direction_fit.grade(job, sales_only).verdict == "on_direction"


# ── pools ────────────────────────────────────────────────────────────────────

def test_grade_all_keys_by_job_and_skips_rows_with_no_id():
    rows = [
        {"job_id": "a", "main_skills": ["Regional Sales", "Sales Process"]},
        {"job_id": "b", "main_skills": ["Welding"]},
        {"job_id": "c", "main_skills": None},
        {"job_id": "", "main_skills": ["Regional Sales", "Sales Process"]},
    ]
    graded = direction_fit.grade_all(rows, _vocab("Sales Management"))
    assert set(graded) == {"a", "b", "c"}
    assert graded["a"].verdict == "on_direction"
    assert graded["b"].verdict == "off_direction"
    assert graded["c"].verdict == "unknown"


def test_grade_all_reads_the_skills_key_it_is_given():
    rows = [{"job_id": "a", "skills": ["Regional Sales", "Sales Process"]}]
    graded = direction_fit.grade_all(rows, _vocab("Sales Management"), skills_key="skills")
    assert graded["a"].verdict == "on_direction"


def test_a_string_of_skills_is_not_a_list_of_them():
    rows = [{"job_id": "a", "main_skills": "Regional Sales, Sales Process"}]
    assert direction_fit.grade_all(rows, _vocab("Sales Management"))["a"].verdict == "unknown"
