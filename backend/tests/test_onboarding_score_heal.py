"""A missing score must retry itself — and exactly once per window.

After the 2026-07-31 `domain_skill_counts` outage, three prod users had confirmed
skills, a chosen direction, and no score row. `get_result` answered
`full_result_processing` on every poll, forever, because the branch that detects
"no score yet" only reported the condition and never acted on it. RQ had already
exhausted the job's retries days earlier. Nothing else was going to run.

The other half matters just as much: the endpoint this heal lives on is polled
every 2 seconds. An undebounced repair would make one stalled user into thirty
jobs a minute on a queue shared with production.
"""

from __future__ import annotations

import pytest

from app.services import background, onboarding_service
from app.services.background import debounce


@pytest.fixture(autouse=True)
def _isolated_claims(monkeypatch: pytest.MonkeyPatch):
    """No Redis in tests → the local-dict path. Clear it between tests."""
    monkeypatch.setattr(debounce.settings, "redis_url", "", raising=False)
    debounce._LOCAL_CLAIMS.clear()
    yield
    debounce._LOCAL_CLAIMS.clear()


@pytest.fixture
def enqueued(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    calls: list[dict] = []

    def _capture(lane: str, job_type: str, *, payload: dict, correlation_id: str | None = None):
        calls.append({
            "lane": lane,
            "job_type": job_type,
            "payload": payload,
            "correlation_id": correlation_id,
        })

    monkeypatch.setattr(background, "enqueue", _capture)
    return calls


def test_missing_score_re_enqueues_the_job(enqueued: list[dict]) -> None:
    onboarding_service.enqueue_score_refresh("user-1", reason="heal")

    assert len(enqueued) == 1
    assert enqueued[0]["job_type"] == "onboarding_target_refresh"
    assert enqueued[0]["lane"] == background.LANE_FAST
    assert enqueued[0]["payload"] == {"user_id": "user-1"}


def test_a_polling_client_does_not_become_a_job_storm(enqueued: list[dict]) -> None:
    # /onboarding/result polls every 2s; 60 polls is two minutes of one user waiting.
    for _ in range(60):
        onboarding_service.enqueue_score_refresh("user-1", reason="heal")

    assert len(enqueued) == 1


def test_each_user_gets_their_own_window(enqueued: list[dict]) -> None:
    onboarding_service.enqueue_score_refresh("user-1", reason="heal")
    onboarding_service.enqueue_score_refresh("user-2", reason="heal")

    assert [call["payload"]["user_id"] for call in enqueued] == ["user-1", "user-2"]


def test_heal_failure_never_breaks_the_result_read(monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args, **_kwargs):
        raise RuntimeError("redis down")

    monkeypatch.setattr(background, "enqueue", _explode)
    onboarding_service.enqueue_score_refresh("user-1", reason="heal")  # must not raise


def test_score_heal_does_not_reuse_the_exhausted_job_id(enqueued: list[dict]) -> None:
    """The correlation id becomes the RQ job id. It must differ from the
    `target:{user}:{roles}:{band}:{cities}` id whose retries already exhausted, so
    the heal is a new job rather than a poke at a dead one."""
    onboarding_service.enqueue_score_refresh("user-1", reason="heal")

    correlation_id = enqueued[0]["correlation_id"]
    assert correlation_id == "score-heal:user-1"
    assert not correlation_id.startswith("target:")
