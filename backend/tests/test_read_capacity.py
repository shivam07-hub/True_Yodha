from threading import Event, Thread

import httpx
import pytest

from app import database
from app.services.read_capacity import ReadCapacityExceeded, ReadCapacityLimiter


def test_read_capacity_rejects_a_second_claim_after_the_short_queue_wait() -> None:
    limiter = ReadCapacityLimiter(max_inflight=1, queue_timeout_seconds=0)
    held = Event()
    release = Event()

    def hold_claim() -> None:
        with limiter.claim():
            held.set()
            release.wait(timeout=1)

    holder = Thread(target=hold_claim)
    holder.start()
    assert held.wait(timeout=1)

    with pytest.raises(ReadCapacityExceeded):
        with limiter.claim():
            pass

    release.set()
    holder.join(timeout=1)
    assert not holder.is_alive()


def test_read_capacity_releases_after_a_completed_read() -> None:
    limiter = ReadCapacityLimiter(max_inflight=1, queue_timeout_seconds=0)

    with limiter.claim():
        pass


def test_database_transport_rejects_a_read_before_sending_it(monkeypatch) -> None:
    limiter = ReadCapacityLimiter(max_inflight=1, queue_timeout_seconds=0)
    monkeypatch.setattr(database, "_read_capacity", limiter)
    transport = database._RetryingHTTPTransport()
    request = httpx.Request("GET", "https://example.test/rest/v1/jobs")

    with limiter.claim(), pytest.raises(ReadCapacityExceeded):
        transport.handle_request(request)

    with limiter.claim():
        pass
