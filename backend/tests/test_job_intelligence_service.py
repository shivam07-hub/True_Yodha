from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import pytest

from app.services.job_intelligence import (
    FeedbackCommand,
    FeedbackRateLimitError,
    FeedStateCache,
    InvalidJobFeedbackError,
    JobIntelligence,
)


class _FakeRepository:
    def __init__(self, publication: dict | None, latest_batch: object = None) -> None:
        self.publication = publication
        self.latest_batch = latest_batch
        self.publication_reads = 0
        self.batch_reads = 0
        self.existing_feedback: dict | None = None
        self.quality_feedback_today = 0
        self.inserted_feedback: dict | None = None

    def latest_feed_publication(self) -> dict | None:
        self.publication_reads += 1
        return self.publication

    def latest_job_batch_marker(self) -> object:
        self.batch_reads += 1
        return self.latest_batch

    def find_feedback(
        self,
        user_id: str,
        client_event_id: str,
    ) -> dict | None:
        return self.existing_feedback

    def count_quality_feedback_since(
        self,
        user_id: str,
        since: datetime,
    ) -> int:
        return self.quality_feedback_today

    def insert_feedback(self, payload: dict) -> tuple[dict, bool]:
        self.inserted_feedback = payload
        return (
            {
                "id": 7,
                **payload,
                "created_at": "2026-06-13T09:00:00+00:00",
            },
            True,
        )



def test_feed_state_uses_successful_audit_as_publication_clock() -> None:
    repo = _FakeRepository(
        {
            "run_id": "d0fd1be0-2348-4a65-95f1-ded8cfc43cc8",
            "created_at": "2026-06-13T08:30:00+00:00",
            "total_rows": 17_956,
        },
        latest_batch=20260604,
    )
    intelligence = JobIntelligence(repo, feed_cache=FeedStateCache())

    result = intelligence.feed_state()

    assert result.not_modified is False
    assert result.etag == '"feed-d0fd1be0-2348-4a65-95f1-ded8cfc43cc8"'
    assert result.state.feed_version == "d0fd1be0-2348-4a65-95f1-ded8cfc43cc8"
    assert result.state.published_at == datetime(2026, 6, 13, 8, 30, tzinfo=timezone.utc)
    assert result.state.imported_job_count == 17_956
    assert result.state.latest_batch_date == "2026-06-04"


def test_feed_state_returns_not_modified_for_matching_etag() -> None:
    repo = _FakeRepository(
        {
            "run_id": "run-1",
            "created_at": "2026-06-13T08:30:00+00:00",
            "total_rows": 20,
        }
    )
    intelligence = JobIntelligence(repo, feed_cache=FeedStateCache())

    first = intelligence.feed_state()
    second = intelligence.feed_state(if_none_match=first.etag)

    assert second.not_modified is True
    assert second.etag == first.etag


def test_feed_state_caches_database_reads_within_ttl() -> None:
    now = [10.0]
    repo = _FakeRepository(
        {
            "run_id": "run-1",
            "created_at": "2026-06-13T08:30:00+00:00",
            "total_rows": 20,
        }
    )
    cache = FeedStateCache(ttl_seconds=60, clock=lambda: now[0])
    intelligence = JobIntelligence(repo, feed_cache=cache)

    intelligence.feed_state()
    intelligence.feed_state()
    now[0] = 71.0
    intelligence.feed_state()

    assert repo.publication_reads == 2
    assert repo.batch_reads == 2


def test_feed_state_has_stable_empty_version_before_first_publication() -> None:
    intelligence = JobIntelligence(
        _FakeRepository(None),
        feed_cache=FeedStateCache(),
    )

    result = intelligence.feed_state(if_none_match='"feed-empty"')

    assert result.not_modified is True
    assert result.etag == '"feed-empty"'
    assert result.state.feed_version is None
    assert result.state.published_at is None
    assert result.state.imported_job_count == 0
    assert result.state.latest_batch_date is None


def _feedback_command(
    *,
    kind: str = "personal",
    reason: str = "not_my_role",
) -> FeedbackCommand:
    return FeedbackCommand(
        client_event_id=UUID("b31e9d60-0dc0-46e1-bc8f-60e852861bd0"),
        job_id="job-1",
        feedback_kind=kind,
        reason_code=reason,
        surface="dashboard",
    )


def test_record_feedback_rejects_reason_from_the_wrong_taxonomy() -> None:
    intelligence = JobIntelligence(
        _FakeRepository(None),
        feed_cache=FeedStateCache(),
    )

    with pytest.raises(InvalidJobFeedbackError):
        intelligence.record_feedback(
            "user-1",
            _feedback_command(kind="personal", reason="apply_link_closed"),
        )


def test_record_feedback_is_idempotent_before_rate_limit_checks() -> None:
    repo = _FakeRepository(None)
    repo.existing_feedback = {
        "id": 9,
        "client_event_id": "b31e9d60-0dc0-46e1-bc8f-60e852861bd0",
        "job_id": "job-1",
        "user_id": "user-1",
        "feedback_kind": "quality",
        "reason_code": "apply_link_closed",
        "surface": "market",
        "created_at": "2026-06-13T09:00:00+00:00",
    }
    repo.quality_feedback_today = 3
    intelligence = JobIntelligence(repo, feed_cache=FeedStateCache())

    receipt = intelligence.record_feedback(
        "user-1",
        _feedback_command(kind="quality", reason="apply_link_closed"),
    )

    assert receipt.created is False
    assert receipt.event_id == 9
    assert repo.inserted_feedback is None


def test_record_feedback_caps_new_quality_reports_per_day() -> None:
    repo = _FakeRepository(None)
    repo.quality_feedback_today = 3
    intelligence = JobIntelligence(repo, feed_cache=FeedStateCache())

    with pytest.raises(FeedbackRateLimitError):
        intelligence.record_feedback(
            "user-1",
            _feedback_command(kind="quality", reason="looks_old"),
        )


def test_record_feedback_inserts_personal_signal_without_quality_cap() -> None:
    repo = _FakeRepository(None)
    repo.quality_feedback_today = 99
    intelligence = JobIntelligence(repo, feed_cache=FeedStateCache())

    receipt = intelligence.record_feedback("user-1", _feedback_command())

    assert receipt.created is True
    assert receipt.feedback_kind == "personal"
    assert repo.inserted_feedback == {
        "client_event_id": "b31e9d60-0dc0-46e1-bc8f-60e852861bd0",
        "job_id": "job-1",
        "user_id": "user-1",
        "feedback_kind": "personal",
        "reason_code": "not_my_role",
        "surface": "dashboard",
    }
