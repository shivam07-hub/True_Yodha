from datetime import date

import pytest

from app.services.experience_years import parse_experience_range, total_experience_years


TODAY = date(2026, 7, 31)


@pytest.mark.parametrize("value", [
    "Jan 2020– June 2022", "May 2025 - Present", "06/2020 – 07/2022",
    "2024 – PRESENT", "Jun'26-Present", "2025",
])
def test_parses_observed_cv_date_formats(value: str) -> None:
    assert parse_experience_range(value, today=TODAY) is not None


@pytest.mark.parametrize("value", ["N/A", "Currently Pursuing", "Not specified", ""])
def test_unreadable_cv_dates_remain_unknown(value: str) -> None:
    assert parse_experience_range(value, today=TODAY) is None


def test_overlapping_roles_are_merged_not_double_counted() -> None:
    years = total_experience_years(["Jan 2020 - Dec 2022", "Jan 2022 - Dec 2023"], today=TODAY)
    assert years is not None
    assert 3.9 < years < 4.1
