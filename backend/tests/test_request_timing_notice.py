"""Slow 2xx timing opens a Notice by kind, never by route."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.notice import NoticeBook, bind, unbind
from app.request_timing import RequestTimingMiddleware
from app.services import read_budget


def test_slow_200_over_budget_key_is_not_the_path() -> None:
    book = NoticeBook.testing()
    bind(book)
    app = FastAPI()
    app.add_middleware(RequestTimingMiddleware, slow_ms=0)

    @app.get("/users/me")
    def me() -> dict[str, bool]:
        for _ in range(read_budget.READ_BUDGET_PER_REQUEST + 1):
            read_budget.record_read()
        return {"ok": True}

    try:
        with TestClient(app) as client:
            assert client.get("/users/me").status_code == 200
        rows = book.snapshot()
        assert len(rows) == 1
        assert rows[0].cause_key == "slow_200:reads_over_budget"
        assert "/users/me" not in rows[0].cause_key
        assert rows[0].last_path == "/users/me"
        assert rows[0].status == "open"
    finally:
        unbind()


def test_slow_200_inside_budget_is_blocked_queue_victim() -> None:
    book = NoticeBook.testing()
    bind(book)
    app = FastAPI()
    app.add_middleware(RequestTimingMiddleware, slow_ms=0)

    @app.get("/users/me")
    def me() -> dict[str, bool]:
        return {"ok": True}

    try:
        with TestClient(app) as client:
            assert client.get("/users/me").status_code == 200
        rows = book.snapshot()
        assert len(rows) == 1
        assert rows[0].cause_key == "slow_200:capacity_queue"
        assert rows[0].status == "blocked"
    finally:
        unbind()


def test_slow_500_does_not_open_a_slow_200() -> None:
    book = NoticeBook.testing()
    bind(book)
    app = FastAPI()
    app.add_middleware(RequestTimingMiddleware, slow_ms=0)

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("no")

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            assert client.get("/boom").status_code == 500
        assert book.snapshot() == ()
    finally:
        unbind()


def _app_helper(name: str, file: str, body: str) -> object:
    """A function whose frame reports `file`, as app code does in production."""
    namespace: dict[str, object] = {"read_budget": read_budget}
    exec(compile(f"def {name}():\n    {body}\n", file, "exec"), namespace)
    return namespace[name]


def test_a_slow_query_is_named_for_the_code_that_asked_it() -> None:
    """/jobs/feed-state (12s) and /jobs/at (10.6s) were single unindexed reads
    filed as capacity-queue victims and parked `blocked` among 10,095 sightings."""
    book = NoticeBook.testing()
    bind(book)
    app = FastAPI()
    app.add_middleware(RequestTimingMiddleware, slow_ms=0)
    ask = _app_helper(
        "list_jobs_at_company",
        "/app/app/repositories/jobs.py",
        "read_budget.record_round_trip(10_600.0)",
    )

    @app.get("/jobs/at/{company}")
    def at(company: str) -> dict[str, str]:
        ask()  # type: ignore[operator]
        return {"company": company}

    try:
        with TestClient(app) as client:
            assert client.get("/jobs/at/Axis Bank").status_code == 200
        rows = book.snapshot()
        assert len(rows) == 1
        assert rows[0].cause_key == "slow_200:slow_read:app/repositories/jobs.py:list_jobs_at_company"
        assert rows[0].status == "open", "a slow query is code to fix, not a queue to wait out"
        assert rows[0].last_path == "/jobs/at/Axis Bank"
    finally:
        unbind()


def test_a_fast_round_trip_names_nothing() -> None:
    token = read_budget.begin()
    try:
        read_budget.record_round_trip(read_budget.SLOW_ROUND_TRIP_MS - 1)
        assert read_budget.slowest_round_trip() is None
    finally:
        read_budget.end(token)


def test_the_slowest_trip_wins() -> None:
    token = read_budget.begin()
    try:
        _app_helper("a", "/app/app/services/a.py", "read_budget.record_round_trip(2600.0)")()  # type: ignore[operator]
        _app_helper("b", "/app/app/services/b.py", "read_budget.record_round_trip(2900.0)")()  # type: ignore[operator]
        _app_helper("c", "/app/app/services/c.py", "read_budget.record_round_trip(2700.0)")()  # type: ignore[operator]
        trip = read_budget.slowest_round_trip()
        assert trip is not None
        assert (trip.ms, trip.file, trip.function) == (2900.0, "app/services/b.py", "b")
    finally:
        read_budget.end(token)


def test_waiting_for_a_read_slot_is_not_a_slow_query(monkeypatch) -> None:
    """The read-capacity wait is a queue. Timed into the trip, every queue
    victim would be filed as its own cause."""
    import contextlib

    import httpx

    from app import database

    clock = [0.0]
    monkeypatch.setattr(database.time, "perf_counter", lambda: clock[0])

    @contextlib.contextmanager
    def slow_queue():
        clock[0] += 5.0  # five seconds waiting for a slot
        yield

    monkeypatch.setattr(database._read_capacity, "claim", slow_queue)

    def fast_query(self: object, request: httpx.Request) -> httpx.Response:
        clock[0] += 0.1  # the query itself: 100ms
        return httpx.Response(200, request=request)

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", fast_query)

    token = read_budget.begin()
    try:
        database._SHARED_TRANSPORT.handle_request(httpx.Request("GET", "http://db/rest/v1/jobs"))
        assert read_budget.slowest_round_trip() is None
    finally:
        read_budget.end(token)


def test_a_slow_query_through_the_transport_is_recorded(monkeypatch) -> None:
    import httpx

    from app import database

    clock = [0.0]
    monkeypatch.setattr(database.time, "perf_counter", lambda: clock[0])

    def slow_query(self: object, request: httpx.Request) -> httpx.Response:
        clock[0] += 12.3  # the feed-state batch_date scan
        return httpx.Response(200, request=request)

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", slow_query)

    token = read_budget.begin()
    try:
        database._SHARED_TRANSPORT.handle_request(httpx.Request("GET", "http://db/rest/v1/jobs"))
        trip = read_budget.slowest_round_trip()
        assert trip is not None
        assert trip.ms == 12_300.0
    finally:
        read_budget.end(token)
