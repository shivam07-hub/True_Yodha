"""A full-time seat is exclusive on the page (ADR-0026 step 4)."""

from __future__ import annotations

from app.services.cv_seat_exclusivity import overlapping_seats


def _row(role: str, company: str, dates: str) -> dict[str, str]:
    return {"role": role, "company": company, "dates": dates}


def test_two_employers_that_run_at_once_are_flagged() -> None:
    experience = [
        _row("Consultant", "Capgemini", "2021 - 2023"),
        _row("Analyst", "Finlatics", "2022 - 2022"),
    ]
    pair = overlapping_seats(experience)
    assert pair is not None
    assert "Capgemini" in pair[0]
    assert "Finlatics" in pair[1]


def test_adjacent_roles_do_not_overlap() -> None:
    # A role that ends the same month the next begins is adjacent, not concurrent.
    experience = [
        _row("Analyst", "Acme", "Jan 2020 - Mar 2022"),
        _row("Lead", "Beta", "Mar 2022 - Jan 2024"),
    ]
    assert overlapping_seats(experience) is None


def test_undated_rows_are_ignored() -> None:
    experience = [
        _row("Volunteer", "Club", ""),
        _row("Analyst", "Acme", "2021 - 2023"),
    ]
    assert overlapping_seats(experience) is None


def test_a_single_dated_role_cannot_overlap() -> None:
    assert overlapping_seats([_row("Analyst", "Acme", "2021 - 2023")]) is None


def test_a_non_list_is_not_a_defect() -> None:
    assert overlapping_seats(None) is None
    assert overlapping_seats("2021 - 2023") is None
