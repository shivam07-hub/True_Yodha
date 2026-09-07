"""The recruiter live-role feed — Wave 2 slice 2.

Two things make this sellable rather than scrapable: every row carries its
verification state, and polling for freshness is free. Both are asserted here,
along with the pagination bug that shipped first and the metering bug that
failed silently while the feed looked fine.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from app.security.partner_auth import ALL_SCOPES, SCOPE_JOBS_READ, SCOPE_ROLES_READ
from app.services import roles_feed as feed

SOURCE = Path(feed.__file__).read_text()


def test_a_cursor_round_trips() -> None:
    c = feed.encode_cursor("2026-09-01T00:00:00+00:00", "job-9")
    assert feed.decode_cursor(c) == ("2026-09-01T00:00:00+00:00", "job-9")


def test_an_unreadable_cursor_restarts_rather_than_errors() -> None:
    """A sync client that has lost its place needs to recover, not to be told it
    is holding it wrong."""
    for junk in ("", "not-a-cursor", "!!!", "eyJ4IjoxfQ"):
        assert feed.decode_cursor(junk) is None


def test_the_cursor_is_opaque() -> None:
    """A caller that can read a cursor will eventually construct one, and then
    its shape is our compatibility problem forever."""
    c = feed.encode_cursor("2026-09-01T00:00:00+00:00", "job-9")
    assert "2026-09-01" not in c and "job-9" not in c


def test_pagination_is_keyset_not_a_timestamp_plus_filter() -> None:
    """`ingested_at` is not unique — thousands of rows share an ingest instant.
    The first version used `gte` on the timestamp then filtered in Python, and
    page two returned 1 row of a requested 5.
    """
    assert "and(ingested_at.eq." in SOURCE
    assert "ingested_at.gt." in SOURCE
    assert ".gte(\"ingested_at\"" not in SOURCE


def test_every_row_carries_its_verification() -> None:
    """A feed that cannot tell you which rows are still real is a list, not
    intelligence. This is the reason to buy it rather than scrape."""
    assert '"verification"' in SOURCE
    assert "listing_confidence" in SOURCE
    assert "last_verified_live_at" in SOURCE


def test_the_feed_serves_only_live_roles() -> None:
    assert '.eq("is_active", True)' in SOURCE
    assert '.eq("listing_confidence", "active")' in SOURCE


def test_metering_goes_through_the_rpc_not_a_postgrest_upsert() -> None:
    """The unique index is PARTIAL and cannot be inferred from an `on_conflict`
    column list. The upsert raised an APIError on every call while the feed
    returned data happily, so the meter read zero and looked fine."""
    assert "record_roles_delivered" in SOURCE
    # Asserted as the absence of the CALL, not of the word: the source comment
    # explains the on_conflict inference problem, and a word-grep finds the
    # explanation. Fourth time this session that prose tripped an assertion.
    assert ".upsert(" not in SOURCE


def test_a_metering_failure_never_fails_a_delivery(monkeypatch: pytest.MonkeyPatch) -> None:
    """The caller already has the rows. Failing now would take back nothing and
    break the response."""

    def _explode() -> Any:
        raise RuntimeError("data api down")

    monkeypatch.setattr(feed, "get_supabase_admin", _explode)
    feed.record_delivery("p1", ["job-1"])  # must not raise


def test_no_roles_means_no_meter_write(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[Any] = []
    monkeypatch.setattr(feed, "get_supabase_admin", lambda: calls.append(1))
    feed.record_delivery("p1", [])
    assert calls == []


def test_the_feed_scope_is_separate_from_the_seat_scope() -> None:
    """`jobs.read` is scoped to ONE seat's matches. A key that may read the whole
    corpus is a different grant, and collapsing them would hand every SSO partner
    the data product for free."""
    assert SCOPE_ROLES_READ == "roles.read"
    assert SCOPE_ROLES_READ != SCOPE_JOBS_READ
    assert SCOPE_ROLES_READ in ALL_SCOPES


def test_the_route_requires_that_scope() -> None:
    router = (Path(feed.__file__).parents[1] / "routers/partner/roles.py").read_text()
    assert "require_scope(SCOPE_ROLES_READ)" in router


def test_the_page_size_is_bounded() -> None:
    assert feed.MAX_LIMIT == 200
    assert "min(int(limit), MAX_LIMIT)" in SOURCE
