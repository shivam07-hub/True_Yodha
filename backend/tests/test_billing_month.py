"""IST billing month is the engagement period (ENG1 / MTR4)."""

from datetime import datetime, timezone

from app.services.billing_month import in_current_period, ist_month_start, ist_period_end


def test_4am_ist_on_the_first_belongs_to_that_month() -> None:
    # 4:00 IST on 1 Oct = 22:30 UTC on 30 Sep. UTC month would be September.
    utc = datetime(2026, 9, 30, 22, 30, tzinfo=timezone.utc)
    assert ist_month_start(utc) == datetime(2026, 10, 1).date()


def test_period_end_is_the_next_ist_month() -> None:
    utc = datetime(2026, 10, 15, 8, 0, tzinfo=timezone.utc)
    end = ist_period_end(utc)
    assert end.astimezone(timezone.utc).month == 10 or end.month == 11
    assert ist_month_start(end) == datetime(2026, 11, 1).date()


def test_a_pass_requested_this_month_counts() -> None:
    now = datetime(2026, 10, 20, 6, 0, tzinfo=timezone.utc)
    requested = datetime(2026, 10, 3, 4, 0, tzinfo=timezone.utc)
    assert in_current_period(requested, now) is True


def test_a_pass_from_last_month_does_not_count() -> None:
    now = datetime(2026, 10, 2, 6, 0, tzinfo=timezone.utc)
    requested = datetime(2026, 9, 20, 6, 0, tzinfo=timezone.utc)
    assert in_current_period(requested, now) is False
