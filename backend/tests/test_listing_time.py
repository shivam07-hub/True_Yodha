"""The four times on a listing, before any caller reads them.

The cases are the ones the old decoders got wrong: a marker that does not
parse was treated as fresh, a stamp copied from `last_seen` was treated as
a check, and local midnight and UTC midnight disagreed about the day.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.services.listing_time import CONFIRM_WITHIN, day, marker, verdict

NOW = datetime(2026, 9, 27, 12, 0, tzinfo=timezone.utc)


def _row(**overrides: object) -> dict:
    base: dict = {
        "is_active": True,
        "listing_confidence": "active",
        "first_seen": 20260711,
        "last_seen": 20260711,
        "ingested_at": "2026-07-11T08:00:00+00:00",
        "last_verified_live_at": None,
    }
    base.update(overrides)
    return base


def test_an_unparseable_marker_is_unconfirmed_not_fresh():
    """`_is_marker_stale` returned False when the marker did not parse, and
    the card read that as fresh. A day that is not a day confirms nothing."""
    row = _row(
        first_seen="not-a-date",
        last_seen=20261399,
        last_verified_live_at="yesterday",
        ingested_at="also-nope",
    )

    got = verdict(row, now=NOW)

    assert got.state == "unconfirmed"
    assert got.discovered_on is None
    assert got.confirmed_at is None
    assert got.received_at is None


def test_a_never_verified_listing_is_unconfirmed():
    """A discovery marker from this morning is still not a check."""
    got = verdict(
        _row(first_seen=20260927, last_seen=20260927),
        now=NOW,
    )

    assert got.state == "unconfirmed"
    assert got.confirmed_at is None
    assert got.discovered_on.isoformat() == "2026-09-27"
    assert got.received_at == datetime(2026, 7, 11, 8, 0, tzinfo=timezone.utc)


def test_a_seeded_stamp_is_unconfirmed():
    """`20260711` copied `last_seen` into `last_verified_live_at`. The date
    matches, so the stamp is the copy, including one later the same UTC day."""
    midnight = verdict(
        _row(last_verified_live_at="2026-07-11T00:00:00+00:00"),
        now=datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc),
    )
    same_afternoon = verdict(
        _row(last_verified_live_at="2026-07-11T18:30:00+00:00"),
        now=datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc),
    )

    assert midnight.state == "unconfirmed"
    assert midnight.confirmed_at is None
    assert same_afternoon.state == "unconfirmed"
    assert same_afternoon.confirmed_at is None


def test_a_genuine_recent_stamp_is_confirmed_open():
    stamp = "2026-09-26T15:04:00+00:00"
    got = verdict(_row(last_verified_live_at=stamp), now=NOW)

    assert got.state == "confirmed_open"
    assert got.confirmed_at == datetime(2026, 9, 26, 15, 4, tzinfo=timezone.utc)
    assert got.discovered_on.isoformat() == "2026-07-11"


def test_a_genuine_stamp_older_than_the_window_is_unconfirmed():
    """The instant is still the answer to *when*. It is not still 'open'."""
    stamp = NOW - CONFIRM_WITHIN - timedelta(seconds=1)
    got = verdict(_row(last_verified_live_at=stamp), now=NOW)

    assert got.state == "unconfirmed"
    assert got.confirmed_at == stamp


def test_the_window_holds_on_either_side_of_utc_midnight():
    """Server-local today and UTC today disagree for part of every day.
    The cutoff is the UTC instant, on both sides of midnight."""
    stamp = datetime(2026, 9, 20, 0, 0, tzinfo=timezone.utc)
    row = _row(last_verified_live_at=stamp)

    just_before = datetime(2026, 9, 26, 23, 59, 59, tzinfo=timezone.utc)
    at_seven_days = stamp + CONFIRM_WITHIN
    one_second_past = at_seven_days + timedelta(seconds=1)

    assert verdict(row, now=just_before).state == "confirmed_open"
    assert verdict(row, now=at_seven_days).state == "confirmed_open"
    assert verdict(row, now=one_second_past).state == "unconfirmed"
    # 00:30 UTC on the 27th is still the 26th in US time zones, and already
    # the 27th in India. The stamp's day does not move with either.
    assert verdict(row, now=datetime(2026, 9, 27, 0, 30, tzinfo=timezone.utc)).discovered_on.isoformat() == "2026-07-11"


def test_the_seed_predicate_compares_utc_dates():
    """`2026-09-01T02:00+05:30` is still 31 August in UTC. It is not the copy
    of a 1 September marker. The same clock read in the offset's zone is."""
    now = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)
    still_august = verdict(
        _row(last_seen=20260901, last_verified_live_at="2026-09-01T02:00:00+05:30"),
        now=now,
    )
    already_september = verdict(
        _row(last_seen=20260901, last_verified_live_at="2026-09-02T02:00:00+05:30"),
        now=now,
    )

    assert still_august.state == "confirmed_open"
    assert still_august.confirmed_at == datetime(2026, 8, 31, 20, 30, tzinfo=timezone.utc)
    assert already_september.state == "unconfirmed"
    assert already_september.confirmed_at is None


def test_a_naive_instant_is_read_as_utc():
    stamp = datetime(2026, 9, 26, 15, 4)
    got = verdict(_row(last_verified_live_at=stamp), now=datetime(2026, 9, 27, 12, 0))

    assert got.state == "confirmed_open"
    assert got.confirmed_at == datetime(2026, 9, 26, 15, 4, tzinfo=timezone.utc)


def test_an_explicit_close_stays_closed_with_a_recent_stamp():
    """The close path does not clear `last_verified_live_at`. The stamp
    alone must not call a closed listing open."""
    got = verdict(
        _row(
            is_active=False,
            listing_confidence="closed",
            last_verified_live_at="2026-09-26T12:00:00+00:00",
        ),
        now=NOW,
    )

    assert got.state == "closed"
    assert got.confirmed_at == datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc)


def test_a_missing_close_flag_is_not_a_close():
    got = verdict(
        {
            "first_seen": 20260711,
            "last_seen": 20260101,
            "last_verified_live_at": None,
        },
        now=NOW,
    )

    assert got.state == "unconfirmed"


def test_garbage_does_not_raise_and_does_not_pass_through():
    got = verdict(
        {
            "first_seen": "see you then",
            "last_seen": {"day": 1},
            "ingested_at": 12,
            "last_verified_live_at": object(),
        },
        now=NOW,
    )

    assert got.state == "unconfirmed"
    assert got.discovered_on is None
    assert got.received_at is None
    assert got.confirmed_at is None
    assert verdict(None, now=NOW).state == "unconfirmed"  # type: ignore[arg-type]


def test_a_string_and_a_datetime_stamp_agree():
    stamp = NOW - timedelta(days=1)
    as_dt = verdict(_row(last_verified_live_at=stamp), now=NOW)
    as_str = verdict(_row(last_verified_live_at=stamp.isoformat()), now=NOW)

    assert as_dt == as_str
    assert as_dt.state == "confirmed_open"


def test_a_conclusive_check_is_not_the_seeded_stamp():
    """The close path stamps `last_conclusive_verification_at` and leaves the
    seeded `last_verified_live_at` alone. The when of the check is the first."""
    got = verdict(
        _row(
            last_verified_live_at="2026-07-11T00:00:00+00:00",
            last_conclusive_verification_at="2026-09-26T15:04:00+00:00",
            is_active=False,
            listing_confidence="closed",
        ),
        now=NOW,
    )

    assert got.state == "closed"
    assert got.confirmed_at is None
    assert got.checked_at == datetime(2026, 9, 26, 15, 4, tzinfo=timezone.utc)


def test_now_has_no_default():
    import inspect

    param = inspect.signature(verdict).parameters["now"]
    assert param.default is inspect.Parameter.empty


def test_day_is_total_and_marker_is_the_column_integer():
    assert day(20260426) == date(2026, 4, 26)
    assert day("not a day") is None
    assert day(None) is None
    assert marker(date(2026, 4, 26)) == 20260426
