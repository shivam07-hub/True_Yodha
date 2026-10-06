"""The four times on a listing, before any caller reads them.

The cases are the ones the old decoders got wrong: a marker that does not
parse was treated as fresh, a stamp copied from `last_seen` was treated as
a check, a crawler's feed sighting was treated as a check, and local
midnight and UTC midnight disagreed about the day.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.services.listing_time import CARD_COLUMNS, CONFIRM_WITHIN, day, marker, verdict

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


def _found_live(at: object, **overrides: object) -> dict:
    """The row as the verifier's live verdict leaves it: one instant on all
    three columns (`job_listing_verification.record`, `seen_live`)."""
    stamps = {
        "last_verified_live_at": at,
        "last_conclusive_verification_at": at,
        "reactivated_at": at,
    }
    return _row(**{**stamps, **overrides})


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
    """`20260711` copied `last_seen` into `last_verified_live_at`. No verifier
    opened the page, so there is no check for it to be."""
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


def test_the_seed_copy_in_the_conclusive_clock_is_unconfirmed():
    """`20260805b` copied the seeded stamp into the conclusive clock;
    `20260927100000` then nulled the seeded stamp and left the copy."""
    got = verdict(
        _row(last_conclusive_verification_at="2026-07-11T00:00:00+00:00"),
        now=datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc),
    )

    assert got.state == "unconfirmed"
    assert got.confirmed_at is None
    assert got.checked_at == datetime(2026, 7, 11, tzinfo=timezone.utc)


def test_a_feed_sighting_is_not_a_confirmation():
    """The crawler stamps `last_verified_live_at` when the job_id is in the
    employer's feed. Measured 2026-10-06: 595 live cards said confirmed open
    off that alone."""
    got = verdict(_row(last_verified_live_at="2026-09-26T15:04:00+00:00"), now=NOW)

    assert got.state == "unconfirmed"
    assert got.confirmed_at is None
    assert got.checked_at is None


def test_a_check_followed_by_a_sighting_is_still_the_check():
    """The crawler re-stamps `last_verified_live_at` on every live row it
    sees, and leaves `reactivated_at` alone on one already active. The
    confirmation is the check's instant, not the sighting's."""
    checked = "2026-09-25T09:00:00+00:00"
    got = verdict(
        _found_live(checked, last_verified_live_at="2026-09-26T18:00:00+00:00"),
        now=NOW,
    )

    assert got.state == "confirmed_open"
    assert got.confirmed_at == datetime(2026, 9, 25, 9, 0, tzinfo=timezone.utc)


def test_a_sighting_that_reopens_a_closed_check_is_not_a_confirmation():
    """The verifier found it closed; the crawler then saw it in the feed and
    wrote `is_active`, `active`, the live stamp and `reactivated_at`. The
    last check said closed. Measured 2026-10-06: 813 such rows in a week."""
    got = verdict(
        _row(
            last_conclusive_verification_at="2026-09-25T09:00:00+00:00",
            last_verified_live_at="2026-09-26T18:00:00+00:00",
            reactivated_at="2026-09-26T18:00:00+00:00",
        ),
        now=NOW,
    )

    assert got.state == "unconfirmed"
    assert got.confirmed_at is None
    assert got.checked_at == datetime(2026, 9, 25, 9, 0, tzinfo=timezone.utc)


def test_a_later_check_that_did_not_find_it_live_withdraws_the_confirmation():
    """Live on the 24th, redirected on the 26th: the redirect stamps only the
    conclusive clock and sets `uncertain`. Measured 2026-10-06: 1,022 cards
    still said confirmed open off the earlier stamp."""
    earlier = "2026-09-24T09:00:00+00:00"
    got = verdict(
        _found_live(
            earlier,
            listing_confidence="uncertain",
            last_conclusive_verification_at="2026-09-26T09:00:00+00:00",
        ),
        now=NOW,
    )

    assert got.state == "unconfirmed"
    assert got.confirmed_at is None


def test_a_check_on_the_discovery_day_is_a_confirmation():
    """The seed guard rejected any stamp on the UTC day of `last_seen`, so a
    listing checked the day it was found never read as checked."""
    got = verdict(
        _found_live("2026-09-27T09:00:00+00:00", first_seen=20260927, last_seen=20260927),
        now=NOW,
    )

    assert got.state == "confirmed_open"
    assert got.confirmed_at == datetime(2026, 9, 27, 9, 0, tzinfo=timezone.utc)


def test_a_genuine_recent_stamp_is_confirmed_open():
    stamp = "2026-09-26T15:04:00+00:00"
    got = verdict(_found_live(stamp), now=NOW)

    assert got.state == "confirmed_open"
    assert got.confirmed_at == datetime(2026, 9, 26, 15, 4, tzinfo=timezone.utc)
    assert got.discovered_on.isoformat() == "2026-07-11"


def test_a_genuine_stamp_older_than_the_window_is_unconfirmed():
    """The instant is still the answer to *when*. It is not still 'open'."""
    stamp = NOW - CONFIRM_WITHIN - timedelta(seconds=1)
    got = verdict(_found_live(stamp), now=NOW)

    assert got.state == "unconfirmed"
    assert got.confirmed_at == stamp


def test_the_window_holds_on_either_side_of_utc_midnight():
    """Server-local today and UTC today disagree for part of every day.
    The cutoff is the UTC instant, on both sides of midnight."""
    stamp = datetime(2026, 9, 20, 0, 0, tzinfo=timezone.utc)
    row = _found_live(stamp)

    just_before = datetime(2026, 9, 26, 23, 59, 59, tzinfo=timezone.utc)
    at_seven_days = stamp + CONFIRM_WITHIN
    one_second_past = at_seven_days + timedelta(seconds=1)

    assert verdict(row, now=just_before).state == "confirmed_open"
    assert verdict(row, now=at_seven_days).state == "confirmed_open"
    assert verdict(row, now=one_second_past).state == "unconfirmed"
    # 00:30 UTC on the 27th is still the 26th in US time zones, and already
    # the 27th in India. The stamp's day does not move with either.
    assert verdict(row, now=datetime(2026, 9, 27, 0, 30, tzinfo=timezone.utc)).discovered_on.isoformat() == "2026-07-11"


def test_one_instant_written_in_two_offsets_is_the_same_check():
    """PostgREST returns UTC; a test or a caller may hand an offset. The
    verifier's instant is the same instant either way."""
    got = verdict(
        _row(
            last_conclusive_verification_at="2026-09-26T02:00:00+05:30",
            reactivated_at="2026-09-25T20:30:00+00:00",
        ),
        now=NOW,
    )

    assert got.state == "confirmed_open"
    assert got.confirmed_at == datetime(2026, 9, 25, 20, 30, tzinfo=timezone.utc)


def test_a_naive_instant_is_read_as_utc():
    stamp = datetime(2026, 9, 26, 15, 4)
    got = verdict(_found_live(stamp), now=datetime(2026, 9, 27, 12, 0))

    assert got.state == "confirmed_open"
    assert got.confirmed_at == datetime(2026, 9, 26, 15, 4, tzinfo=timezone.utc)


def test_an_explicit_close_stays_closed_with_a_recent_stamp():
    """The close path does not clear `last_verified_live_at`. The stamp
    alone must not call a closed listing open."""
    got = verdict(
        _found_live(
            "2026-09-25T12:00:00+00:00",
            is_active=False,
            listing_confidence="closed",
            last_conclusive_verification_at="2026-09-26T12:00:00+00:00",
        ),
        now=NOW,
    )

    assert got.state == "closed"
    assert got.confirmed_at is None


def test_a_close_without_a_check_keeps_the_check_it_had():
    """The crawler's misses retire a row without opening the page. The last
    check still found it live; the row is still closed."""
    got = verdict(
        _found_live("2026-09-26T12:00:00+00:00", is_active=False, listing_confidence="closed"),
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
            "last_conclusive_verification_at": object(),
            "reactivated_at": object(),
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
    as_dt = verdict(_found_live(stamp), now=NOW)
    as_str = verdict(_found_live(stamp.isoformat()), now=NOW)

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


def test_a_card_reads_the_verdict_not_the_column():
    """The /market card handed the raw integer to a string field and 500'd
    for every user with a kept job. A card's three listing fields come from
    one verdict, and the marker never reaches the wire as an integer."""
    unconfirmed = verdict(_row(), now=NOW).card()
    assert unconfirmed == {
        "first_seen": "2026-07-11",
        "last_seen_at": None,
        "is_stale": True,
    }

    stamp = NOW - timedelta(days=1)
    confirmed = verdict(_found_live(stamp.isoformat()), now=NOW).card()
    assert confirmed == {
        "first_seen": "2026-07-11",
        "last_seen_at": stamp.date().isoformat(),
        "is_stale": False,
    }


def test_a_card_with_no_marker_says_so():
    assert verdict(_row(first_seen=None), now=NOW).card()["first_seen"] is None


def test_card_columns_are_every_column_a_card_reads():
    """A card path that selects fewer columns reads every card as
    unconfirmed, or a closed one as open. Each column changes some card."""
    columns = CARD_COLUMNS.split(",")
    live = _found_live((NOW - timedelta(days=1)).isoformat())
    closed = {**live, "is_active": False, "listing_confidence": "closed"}

    def card_without(row: dict, *dropped: str) -> dict:
        return verdict({k: row[k] for k in columns if k not in dropped}, now=NOW).card()

    assert card_without(live) == verdict(live, now=NOW).card()
    assert card_without(live, "first_seen")["first_seen"] is None
    assert card_without(live, "last_conclusive_verification_at")["is_stale"] is True
    assert card_without(live, "last_verified_live_at", "reactivated_at")["is_stale"] is True
    assert card_without(closed, "is_active", "listing_confidence")["is_stale"] is False
    assert card_without(closed)["is_stale"] is True
