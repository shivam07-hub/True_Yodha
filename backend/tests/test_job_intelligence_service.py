from __future__ import annotations

from datetime import datetime, timezone

from app.services.job_intelligence import (
    FeedStateCache,
    JobIntelligence,
)


class _FakeRepository:
    def __init__(self, publication: dict | None, latest_batch: object = None) -> None:
        self.publication = publication
        self.latest_batch = latest_batch
        self.publication_reads = 0
        self.batch_reads = 0

    def latest_feed_publication(self) -> dict | None:
        self.publication_reads += 1
        return self.publication

    def latest_job_batch_marker(self) -> object:
        self.batch_reads += 1
        return self.latest_batch


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
