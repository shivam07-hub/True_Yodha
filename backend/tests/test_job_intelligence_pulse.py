from datetime import datetime, timezone

import pytest

from app.services.job_intelligence import (
    FeedStateCache,
    InvalidJobPulseRequest,
    JobIntelligence,
)


class _PulseRepository:
    def __init__(self, rows: list[dict] | None = None) -> None:
        self.rows = rows or []

    def pulse_rows(self, job_ids: list[str]) -> list[dict]:
        return [row for row in self.rows if row.get("job_id") in job_ids]


def _pulse_row(
    job_id: str,
    *,
    last_seen: object = 20260612,
    is_active: bool = True,
    tracking_count: int = 8,
    applied_count: int = 6,
    outcome_count: int = 5,
    responded_count: int = 3,
    ghosted_count: int = 2,
    quality_report_count: int = 0,
    looks_old_count: int = 0,
    apply_link_closed_count: int = 0,
    posting_inactive_count: int = 0,
) -> dict:
    return {
        "job_id": job_id,
        "first_seen": 20260601,
        "last_seen": last_seen,
        "is_active": is_active,
        "tracking_count": tracking_count,
        "applied_count": applied_count,
        "outcome_count": outcome_count,
        "responded_count": responded_count,
        "ghosted_count": ghosted_count,
        "interviewed_count": 2,
        "offer_count": 1,
        "quality_report_count": quality_report_count,
        "looks_old_count": looks_old_count,
        "apply_link_closed_count": apply_link_closed_count,
        "posting_inactive_count": posting_inactive_count,
    }


@pytest.mark.parametrize(
    ("row", "expected"),
    [
        (_pulse_row("discovery"), "uncertain"),
        (_pulse_row("uncertain", last_seen=20260501), "uncertain"),
        (
            _pulse_row(
                "likely",
                apply_link_closed_count=2,
                quality_report_count=2,
            ),
            "likely_closed",
        ),
        (_pulse_row("closed", is_active=False), "closed"),
    ],
)
def test_job_pulse_applies_listing_confidence_policy(
    row: dict,
    expected: str,
) -> None:
    intelligence = JobIntelligence(
        _PulseRepository([row]),  # type: ignore[arg-type]
        feed_cache=FeedStateCache(),
        now=lambda: datetime(2026, 6, 13, tzinfo=timezone.utc),
    )

    pulse = intelligence.pulses([row["job_id"]])[0]

    assert pulse.listing_confidence == expected


def test_a_confirmation_is_what_makes_an_unstamped_listing_active() -> None:
    now = datetime(2026, 6, 13, tzinfo=timezone.utc)
    confirmed = _pulse_row("confirmed", last_seen=20260601)
    for column in ("last_verified_live_at", "last_conclusive_verification_at", "reactivated_at"):
        confirmed[column] = "2026-06-12T15:04:00+00:00"
    stored = _pulse_row("stored")
    stored["listing_confidence"] = "active"
    intelligence = JobIntelligence(
        _PulseRepository([confirmed, stored]),  # type: ignore[arg-type]
        feed_cache=FeedStateCache(),
        now=lambda: now,
    )

    by_id = {pulse.job_id: pulse for pulse in intelligence.pulses(["confirmed", "stored"])}

    assert by_id["confirmed"].listing_confidence == "active"
    assert by_id["confirmed"].is_stale is False
    assert by_id["stored"].listing_confidence == "active"
    assert by_id["stored"].is_stale is True


def test_job_pulse_suppresses_small_community_cohorts() -> None:
    row = _pulse_row(
        "job-1",
        tracking_count=4,
        applied_count=4,
        outcome_count=4,
        responded_count=1,
        ghosted_count=3,
        quality_report_count=2,
        apply_link_closed_count=2,
    )
    intelligence = JobIntelligence(
        _PulseRepository([row]),  # type: ignore[arg-type]
        feed_cache=FeedStateCache(),
        now=lambda: datetime(2026, 6, 13, tzinfo=timezone.utc),
    )

    pulse = intelligence.pulses(["job-1"])[0]

    assert pulse.tracking_count is None
    assert pulse.outcomes_shared is None
    assert pulse.ghosted_count is None
    assert pulse.response_signal is None
    assert pulse.quality_report_count is None
    assert pulse.listing_confidence == "likely_closed"


def test_job_pulse_preserves_requested_order_and_ignores_missing_jobs() -> None:
    intelligence = JobIntelligence(
        _PulseRepository([_pulse_row("job-b"), _pulse_row("job-a")]),  # type: ignore[arg-type]
        feed_cache=FeedStateCache(),
        now=lambda: datetime(2026, 6, 13, tzinfo=timezone.utc),
    )

    pulses = intelligence.pulses(["job-a", "missing", "job-b"])

    assert [pulse.job_id for pulse in pulses] == ["job-a", "job-b"]


def test_job_pulse_verification_date_is_a_real_check() -> None:
    """`last_seen` has never ticked, and a feed sighting is not a check.
    Neither may fill in a verification date."""
    now = datetime(2026, 6, 13, tzinfo=timezone.utc)
    discovery = _pulse_row("discovery")
    sighted = _pulse_row("sighted")
    sighted["last_verified_live_at"] = "2026-06-12T18:00:00+00:00"
    genuine = _pulse_row("genuine", last_seen=20260601)
    genuine["last_conclusive_verification_at"] = "2026-06-12T15:04:00+00:00"
    genuine["reactivated_at"] = "2026-06-12T15:04:00+00:00"
    genuine["last_verified_live_at"] = "2026-06-12T18:00:00+00:00"
    intelligence = JobIntelligence(
        _PulseRepository([discovery, sighted, genuine]),  # type: ignore[arg-type]
        feed_cache=FeedStateCache(),
        now=lambda: now,
    )

    by_id = {pulse.job_id: pulse for pulse in intelligence.pulses(["discovery", "sighted", "genuine"])}

    assert by_id["discovery"].last_verified_at is None
    assert by_id["sighted"].last_verified_at is None
    assert by_id["sighted"].is_stale is True
    assert by_id["genuine"].last_verified_at == "2026-06-12"
    assert by_id["genuine"].first_seen_at == "2026-06-01"


def test_job_pulse_rejects_more_than_100_unique_ids() -> None:
    intelligence = JobIntelligence(
        _PulseRepository(),  # type: ignore[arg-type]
        feed_cache=FeedStateCache(),
    )

    with pytest.raises(InvalidJobPulseRequest):
        intelligence.pulses([f"job-{index}" for index in range(101)])
