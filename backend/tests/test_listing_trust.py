"""A listing may only be called checked if somebody opened it.

The cases are the ones that made this module necessary: rows the crawler saw in
a feed and nobody ever fetched, and rows a verifier fetched weeks ago.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services import listing_trust

NOW = datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc)


def _row(**kw):
    base = {"last_verified_live_at": None, "last_conclusive_verification_at": None}
    base.update(kw)
    return base


def test_a_listing_the_crawler_saw_but_nobody_opened_is_unchecked():
    """18,080 live rows looked like this on 2026-09-22. The crawler stamping
    `last_verified_live_at` is list membership, not a fetch."""
    row = _row(last_verified_live_at="2026-09-22T00:00:00+00:00")

    claim = listing_trust.verification_claim(row, now=NOW)

    assert claim["state"] == "unchecked"
    assert claim["checked_at"] is None
    # Kept, but named for what it is rather than thrown away.
    assert claim["source_seen_at"] == "2026-09-22T00:00:00+00:00"
    assert listing_trust.was_checked_within(row, now=NOW) is False


def test_a_recently_opened_listing_is_checked():
    row = _row(last_conclusive_verification_at=(NOW - timedelta(days=2)).isoformat())

    claim = listing_trust.verification_claim(row, now=NOW)

    assert claim["state"] == "checked"
    assert claim["window_days"] == 7
    assert listing_trust.was_checked_within(row, now=NOW) is True


def test_an_old_check_goes_stale_rather_than_staying_verified():
    """Namitha's audit: ~3 in 10 listings die within a fortnight. A check with
    no age is not a claim."""
    row = _row(last_conclusive_verification_at=(NOW - timedelta(days=20)).isoformat())

    claim = listing_trust.verification_claim(row, now=NOW)

    assert claim["state"] == "stale"
    assert claim["checked_at"] is not None
    assert listing_trust.was_checked_within(row, now=NOW) is False


def test_unchecked_is_never_reported_as_dead():
    """Absence of evidence is disclosed, not converted into a verdict — the same
    rule that hid 9,323 untagged listings from the feed."""
    states = {
        listing_trust.verification_claim(_row(), now=NOW)["state"],
        listing_trust.verification_claim(
            _row(last_verified_live_at="2026-09-09T00:00:00+00:00"), now=NOW
        )["state"],
    }

    assert states == {"unchecked"}
    assert "closed" not in states and "dead" not in states


def test_a_datetime_and_its_iso_string_are_read_the_same_way():
    """PostgREST hands back strings; a repository test hands back datetimes."""
    as_dt = _row(last_conclusive_verification_at=NOW - timedelta(days=1))
    as_str = _row(last_conclusive_verification_at=(NOW - timedelta(days=1)).isoformat())

    assert (listing_trust.verification_claim(as_dt, now=NOW)["state"]
            == listing_trust.verification_claim(as_str, now=NOW)["state"] == "checked")


def test_an_unparseable_timestamp_is_unchecked_not_a_crash():
    row = _row(last_conclusive_verification_at="not a date")

    assert listing_trust.verification_claim(row, now=NOW)["state"] == "unchecked"


def test_provenance_counts_opened_listings_not_crawl_sightings():
    """The hero number on the landing page. Its own docstring always promised
    "personally opened"; the query counted the crawler's stamp."""
    from app.repositories import job_provenance

    seen: list[str] = []

    class _Q:
        def gte(self, column, _value):
            seen.append(column)
            return self

        def eq(self, *_a):
            return self

        def select(self, *_a, **_k):
            return self

        def limit(self, *_a):
            return self

        def execute(self):
            return type("R", (), {"count": 1})()

    class _DB:
        def table(self, _name):
            return _Q()

    job_provenance.read_provenance(_DB())

    assert "last_conclusive_verification_at" in seen
    assert "last_verified_live_at" not in seen


def test_partner_rows_carry_the_honest_field_alongside_the_legacy_one():
    """Partners consume `state` and `last_verified_live_at` today, so both stay.
    `checked` is the one that means a verifier opened the page."""
    from app.services import roles_feed

    shaped = roles_feed._row_to_role({
        "job_id": "j1",
        "job_title": "Backend Engineer",
        "company_name": "Acme",
        "listing_confidence": "active",
        "last_verified_live_at": "2026-09-09T00:00:00+00:00",
        "last_conclusive_verification_at": None,
        "main_skills": [],
    })

    # The field keeps its name and now carries only a real check — null here,
    # because the 2026-09-09 stamp was the crawler seeing it in a feed.
    assert shaped["verification"]["state"] == "active"
    assert shaped["verification"]["last_verified_live_at"] is None
    assert shaped["verification"]["checked"]["state"] == "unchecked"
    assert shaped["verification"]["checked"]["source_seen_at"] == "2026-09-09T00:00:00+00:00"


def test_partner_timestamp_carries_a_real_check_when_there_is_one():
    from app.services import roles_feed

    checked_at = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    shaped = roles_feed._row_to_role({
        "job_id": "j2",
        "job_title": "Backend Engineer",
        "company_name": "Acme",
        "listing_confidence": "active",
        "is_active": True,
        "last_verified_live_at": "2026-09-09T00:00:00+00:00",
        "last_conclusive_verification_at": checked_at,
        "main_skills": [],
    })

    assert shaped["verification"]["last_verified_live_at"] == checked_at
    assert shaped["verification"]["checked"]["state"] == "checked"


def test_a_listing_checked_and_found_dead_is_never_called_verified():
    """The error this module nearly shipped: 8,295 of 27,681 listings checked
    inside a week had been checked and found DEAD. The timestamp alone would
    have called every one of them verified live."""
    row = _row(
        last_conclusive_verification_at=(NOW - timedelta(days=1)).isoformat(),
        is_active=False,
        listing_confidence="closed",
    )

    claim = listing_trust.verification_claim(row, now=NOW)

    assert claim["state"] == "closed"
    assert listing_trust.was_checked_within(row, now=NOW) is False


def test_provenance_requires_the_verdict_as_well_as_the_check():
    from app.repositories import job_provenance

    filters: list[tuple] = []

    class _Q:
        def gte(self, c, _v):
            filters.append(("gte", c))
            return self

        def eq(self, c, v):
            filters.append(("eq", c, v))
            return self

        def select(self, *_a, **_k):
            return self

        def limit(self, *_a):
            return self

        def execute(self):
            return type("R", (), {"count": 1})()

    class _DB:
        def table(self, _n):
            return _Q()

    job_provenance.read_provenance(_DB())

    assert ("gte", "last_conclusive_verification_at") in filters
    assert ("eq", "is_active", True) in filters
    assert ("eq", "listing_confidence", "active") in filters
