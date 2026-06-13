from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.routers.jobs.intelligence import get_job_intelligence
from app.services.job_intelligence import FeedState, FeedStateRead


class _FakeIntelligence:
    def __init__(self) -> None:
        self.if_none_match: str | None = None

    def feed_state(self, if_none_match: str | None = None) -> FeedStateRead:
        self.if_none_match = if_none_match
        state = FeedState(
            feed_version="run-1",
            published_at=datetime(2026, 6, 13, 8, 30, tzinfo=timezone.utc),
            imported_job_count=17_956,
            latest_batch_date="2026-06-04",
        )
        etag = '"feed-run-1"'
        return FeedStateRead(
            state=state,
            etag=etag,
            not_modified=if_none_match == etag,
        )


def test_feed_state_requires_authentication() -> None:
    with TestClient(app) as client:
        response = client.get("/jobs/feed-state")

    assert response.status_code == 401


def test_feed_state_returns_payload_and_conditional_headers() -> None:
    intelligence = _FakeIntelligence()
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1")
    app.dependency_overrides[get_job_intelligence] = lambda: intelligence

    try:
        with TestClient(app) as client:
            response = client.get("/jobs/feed-state")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["etag"] == '"feed-run-1"'
    assert response.headers["cache-control"] == "private, max-age=0, must-revalidate"
    assert response.json() == {
        "feed_version": "run-1",
        "published_at": "2026-06-13T08:30:00Z",
        "imported_job_count": 17_956,
        "latest_batch_date": "2026-06-04",
    }


def test_feed_state_returns_304_when_etag_matches() -> None:
    intelligence = _FakeIntelligence()
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1")
    app.dependency_overrides[get_job_intelligence] = lambda: intelligence

    try:
        with TestClient(app) as client:
            response = client.get(
                "/jobs/feed-state",
                headers={"If-None-Match": '"feed-run-1"'},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 304
    assert response.content == b""
    assert response.headers["etag"] == '"feed-run-1"'
    assert intelligence.if_none_match == '"feed-run-1"'
