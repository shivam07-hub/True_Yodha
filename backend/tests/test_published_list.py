"""The /market list shows what the career-ops judge kept."""
from __future__ import annotations

from app.services.matching.published_list import (
    cause_line,
    larger_cut,
    notice,
    order_by_score,
    skill_lines,
    worth_showing,
)


def test_a_job_under_the_bar_is_not_on_the_list() -> None:
    assert worth_showing(3.4, "Skip") is False
    assert worth_showing(3.5, "Negotiate") is True
    assert worth_showing(4.2, "Apply") is True
    assert worth_showing(4.8, "Skip") is False
    assert worth_showing(None, "Apply") is False


def test_the_list_is_the_judge_s_order() -> None:
    rows = order_by_score([
        {"job_id": "b", "overall_score": 3.6},
        {"job_id": "a", "overall_score": 4.4},
        {"job_id": "c", "overall_score": 4.4},
    ])
    assert [row["job_id"] for row in rows] == ["a", "c", "b"]


def test_eight_from_a_small_pool_names_the_aspirations() -> None:
    assert larger_cut(pool=12, cleared=8) == "aspirations"


def test_eight_from_a_large_pool_names_the_skills() -> None:
    assert larger_cut(pool=200, cleared=8) == "skills"


def test_a_full_list_of_good_jobs_needs_no_cause() -> None:
    assert larger_cut(pool=80, cleared=40) is None


def test_skill_lines_come_from_the_skipped_concerns() -> None:
    lines = skill_lines([
        {"concerns": ["SQL", "SQL", "stakeholder updates"]},
        {"concerns": ["a portfolio piece"]},
    ])
    assert lines == ["SQL", "stakeholder updates", "a portfolio piece"]


def test_the_notice_while_reading_is_the_count_and_not_the_cause() -> None:
    text = notice(
        reading=True, read=23, total=80, cleared=8, bound=False,
        cause="skills", skills=["SQL"], cv_replaced=False,
    )
    assert text == "Read 23 of 80 jobs. 8 worth your time."
    assert "SQL" not in (text or "")


def test_a_finished_short_list_says_which_cut_was_larger() -> None:
    text = notice(
        reading=False, read=200, total=200, cleared=8, bound=False,
        cause="skills", skills=["SQL", "a portfolio piece"], cv_replaced=False,
    )
    assert text == cause_line("skills", ["SQL", "a portfolio piece"])


def test_a_replaced_cv_is_named_while_the_new_one_is_read() -> None:
    text = notice(
        reading=True, read=0, total=40, cleared=0, bound=False,
        cause=None, skills=[], cv_replaced=True,
    )
    assert text is not None
    assert text.startswith("These matches are for the CV you replaced.")
    assert "Read 0 of 40 jobs" in text
