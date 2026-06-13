from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.routers.jobs.intelligence import get_job_intelligence
from app.services.job_intelligence import (
    FeedbackRateLimitError,
    FeedbackReceipt,
    FeedState,
    FeedStateRead,
    JobPulse,
)


class _FakeIntelligence:
    def __init__(self) -> None:
        self.if_none_match: str | None = None
        self.feedback_commands: list[tuple[str, object]] = []
        self.feedback_receipt = FeedbackReceipt(
            event_id=7,
            client_event_id=UUID("b31e9d60-0dc0-46e1-bc8f-60e852861bd0"),
            job_id="job-1",
            feedback_kind="personal",
            reason_code="not_my_role",
            surface="dashboard",
            created_at=datetime(2026, 6, 13, 9, 0, tzinfo=timezone.utc),
            created=True,
        )
        self.raise_rate_limit = False
        self.pulse_requests: list[list[str]] = []

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

    def record_feedback(self, user_id: str, command: object) -> FeedbackReceipt:
        self.feedback_commands.append((user_id, command))
        if self.raise_rate_limit:
            raise FeedbackRateLimitError
        return self.feedback_receipt

    def pulses(self, job_ids: list[str]) -> list[JobPulse]:
        self.pulse_requests.append(job_ids)
        return [
            JobPulse(
                job_id=job_id,
                first_seen_at="2026-06-01",
                last_verified_at="2026-06-12",
                is_stale=False,
                listing_confidence="active",
                tracking_count=8,
                outcomes_shared=5,
                ghosted_count=2,
                response_signal="high",
                quality_report_count=None,
            )
            for job_id in job_ids
        ]


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


def test_record_feedback_maps_authenticated_command() -> None:
    intelligence = _FakeIntelligence()
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1")
    app.dependency_overrides[get_job_intelligence] = lambda: intelligence

    try:
        with TestClient(app) as client:
            response = client.post(
                "/jobs/feedback",
                json={
                    "client_event_id": "b31e9d60-0dc0-46e1-bc8f-60e852861bd0",
                    "job_id": "job-1",
                    "feedback_kind": "personal",
                    "reason_code": "not_my_role",
                    "surface": "dashboard",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["created"] is True
    user_id, command = intelligence.feedback_commands[0]
    assert user_id == "user-1"
    assert command.reason_code == "not_my_role"


def test_record_feedback_rejects_cross_taxonomy_reason() -> None:
    intelligence = _FakeIntelligence()
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1")
    app.dependency_overrides[get_job_intelligence] = lambda: intelligence

    try:
        with TestClient(app) as client:
            response = client.post(
                "/jobs/feedback",
                json={
                    "client_event_id": "b31e9d60-0dc0-46e1-bc8f-60e852861bd0",
                    "job_id": "job-1",
                    "feedback_kind": "personal",
                    "reason_code": "apply_link_closed",
                    "surface": "dashboard",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert intelligence.feedback_commands == []


def test_record_feedback_returns_429_for_quality_daily_cap() -> None:
    intelligence = _FakeIntelligence()
    intelligence.raise_rate_limit = True
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1")
    app.dependency_overrides[get_job_intelligence] = lambda: intelligence

    try:
        with TestClient(app) as client:
            response = client.post(
                "/jobs/feedback",
                json={
                    "client_event_id": "b31e9d60-0dc0-46e1-bc8f-60e852861bd0",
                    "job_id": "job-1",
                    "feedback_kind": "quality",
                    "reason_code": "looks_old",
                    "surface": "market",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 429


def test_job_pulses_batches_cards_in_requested_order() -> None:
    intelligence = _FakeIntelligence()
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1")
    app.dependency_overrides[get_job_intelligence] = lambda: intelligence

    try:
        with TestClient(app) as client:
            response = client.post(
                "/jobs/pulses",
                json={"job_ids": ["job-b", "job-a"]},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert intelligence.pulse_requests == [["job-b", "job-a"]]
    assert [row["job_id"] for row in response.json()["pulses"]] == [
        "job-b",
        "job-a",
    ]


def test_job_pulses_rejects_more_than_100_ids() -> None:
    intelligence = _FakeIntelligence()
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1")
    app.dependency_overrides[get_job_intelligence] = lambda: intelligence

    try:
        with TestClient(app) as client:
            response = client.post(
                "/jobs/pulses",
                json={"job_ids": [f"job-{index}" for index in range(101)]},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert intelligence.pulse_requests == []


def test_legacy_inactive_report_uses_quality_feedback_without_xp() -> None:
    intelligence = _FakeIntelligence()
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1")
    app.dependency_overrides[get_job_intelligence] = lambda: intelligence

    try:
        with TestClient(app) as client:
            response = client.post("/jobs/job-1/report")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "report_count": 0,
        "already_reported": False,
        "xp_earned": 0,
    }
    _, command = intelligence.feedback_commands[0]
    assert command.feedback_kind == "quality"
    assert command.reason_code == "posting_inactive"


def test_legacy_inactive_report_preserves_quality_daily_cap() -> None:
    intelligence = _FakeIntelligence()
    intelligence.raise_rate_limit = True
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1")
    app.dependency_overrides[get_job_intelligence] = lambda: intelligence

    try:
        with TestClient(app) as client:
            response = client.post("/jobs/job-1/report")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 429
