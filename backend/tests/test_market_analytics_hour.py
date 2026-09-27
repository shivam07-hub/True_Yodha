"""`jobs_added_1h` is an instant, not a day marker.

A YYYYMMDD marker becomes midnight UTC, so the old count was 0 for 23 hours
and, in the hour after midnight, equal to the whole day's discoveries.
"""
from datetime import datetime, timezone

from app.repositories.jobs import MarketAnalyticsCompiler

NOW = datetime(2026, 9, 27, 15, 30, tzinfo=timezone.utc)
JUST_AFTER_MIDNIGHT = datetime(2026, 9, 27, 0, 30, tzinfo=timezone.utc)


def _row(**over: object) -> dict:
    base: dict = {"company_name": "Acme", "first_seen": 20260101, "ingested_at": None}
    base.update(over)
    return base


def test_an_hour_count_uses_ingested_at_in_the_afternoon():
    payload = MarketAnalyticsCompiler().compile(
        [
            _row(ingested_at="2026-09-27T15:10:00+00:00"),
            _row(ingested_at="2026-09-27T12:00:00+00:00", first_seen=20260927),
        ],
        now=NOW,
    )

    assert payload["jobs_added_1h"] == 1
    assert "scraper_started" not in payload


def test_a_discovery_marker_does_not_fill_the_hour_after_midnight():
    """The old bug: today's marker is midnight, so at 00:30 every discovery
    from the day counted as 'added in the last hour'."""
    payload = MarketAnalyticsCompiler().compile(
        [
            _row(first_seen=20260927, ingested_at="2026-09-26T18:00:00+00:00"),
            _row(first_seen=20260101, ingested_at="2026-09-27T00:10:00+00:00"),
        ],
        now=JUST_AFTER_MIDNIGHT,
    )

    assert payload["jobs_added_1h"] == 1
    assert payload["total_jobs_today"] == 1
